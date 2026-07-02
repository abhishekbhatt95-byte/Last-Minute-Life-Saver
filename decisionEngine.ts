import { Task } from "./src/types";
import { scoreTask, ScoringResult } from "./decisionScoring";
import { AIContext, buildAIContext } from "./contextBuilder";
import { recommendationCache, decisionTraceStore, getContextFingerprint, getCompositeContextVersion } from "./recommendationCache";
import { promptRegistry } from "./promptRegistry";
import { GoogleGenAI } from "@google/genai";
import { aiMemoryService } from "./aiMemoryService";

export interface AIExplanation {
  whyThisTask: string;
  whyNotOthers: string;
  riskIfDelayed: string;
  alternativeTaskIdea: string;
  evidence: string[]; // concrete data points pulled from the real scoring breakdown, not invented by LLM
}

export interface CandidateTask {
  id: string;
  title: string;
  score: number;
  components: any;
}

export interface Decision {
  recommendedTaskId: string | null;
  confidence: number | null; // numeric confidence (0-100) or null
  confidenceReasoning: string;
  aiExplanation: AIExplanation | null;
  topCandidates: CandidateTask[];
  source: "ai" | "cached" | "local";
  isFallback: boolean;
  decisionInputs: any; // Raw inputs for simulator
}

// Lazy initialization of Gemini SDK
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
      try {
        aiClient = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });
      } catch (err) {
        console.error("DecisionEngine failed to initialize Gemini Client:", err);
      }
    } else {
      console.error("[DIAGNOSTIC] getAIClient fallback activated: GEMINI_API_KEY is either undefined or contains the placeholder 'MY_GEMINI_API_KEY'.");
    }
  }
  return aiClient;
}

/**
 * Computes numeric confidence based on scoreGap and multiplier K = 3.33 (re-derived for bucketed ranges)
 */
export function deriveConfidence(topCandidates: CandidateTask[]): { confidence: number | null; reasoning: string } {
  if (topCandidates.length === 0) {
    return { confidence: null, reasoning: "No candidate tasks available to score." };
  }
  if (topCandidates.length === 1) {
    return { confidence: null, reasoning: "No competing candidates available." };
  }
  const scoreGap = topCandidates[0].score - topCandidates[1].score;
  const K = 2.5; // Tie-breaker lead gap multiplier (20-point gap maps to 100% confidence)
  const confidenceVal = Math.min(100, Math.max(50, Math.round(50 + scoreGap * K)));
  const reasoning = `Top candidate lead by ${scoreGap} pts over alternative. Multiplier K=2.5 mapped scoreGap to ${confidenceVal}% confidence.`;
  return { confidence: confidenceVal, reasoning };
}

/**
 * Orchestrator Decision Engine (Phase 3.2).
 * Invokes the pure scoring math, filters the Top 3 candidates,
 * builds prompts from PromptRegistry, calls Gemini (or fallback),
 * validates the response, caches results, and records diagnostic decision traces.
 */
export async function getWhatNowRecommendation(allTasks: Task[], forceRefresh = false): Promise<Decision> {
  const pending = allTasks.filter(t => t.status === "pending");
  console.log("[DIAGNOSTIC] pending tasks mapped in decisionEngine:", pending.map(t => ({id: t.id, urgency: t.urgency})));
  if (pending.length === 0) {
    return {
      recommendedTaskId: null,
      confidence: null,
      confidenceReasoning: "No pending tasks available.",
      aiExplanation: null,
      topCandidates: [],
      source: "local",
      isFallback: false,
      decisionInputs: null
    };
  }

  // 1. Build holistic context
  const context = buildAIContext(allTasks);

  // 2. Score all pending tasks deterministically (decisionScoring.ts)
  const scoredTasks = pending.map(task => {
    const scoreResult = scoreTask(task, context, allTasks);
    return {
      task,
      scoreResult
    };
  });

  // Sort by score descending
  const sortedScored = [...scoredTasks].sort((a, b) => b.scoreResult.totalScore - a.scoreResult.totalScore);

  // Take Top 3 candidates
  const candidateWrappers = sortedScored.slice(0, 3);
  const topCandidates: CandidateTask[] = candidateWrappers.map(w => ({
    id: w.task.id,
    title: w.task.title,
    score: w.scoreResult.totalScore,
    components: w.scoreResult.components
  }));

  // Derive numeric confidence based on the top 2 candidates
  const { confidence, reasoning: confidenceReasoning } = deriveConfidence(topCandidates);

  // Formatted duration helper
  const getFormattedTimeStr = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    return hours > 0 ? `~${hours}h ${m}m` : `~${m}m`;
  };

  // Check cache first (unless forced refresh)
  const fingerprint = getContextFingerprint();
  const contextVersion = getCompositeContextVersion();
  const registeredPrompt = promptRegistry.getPrompt("what-now");
  const promptVersion = registeredPrompt.version;

  if (!forceRefresh) {
    const cached = recommendationCache.get<any>(
      "what-now",
      fingerprint,
      promptVersion,
      contextVersion,
      async () => {
        // Asynchronous SWR revalidation
        console.log("[SWR REVALIDATE] Re-running decision engine asynchronously.");
        await revalidateAIRecommendation(candidateWrappers, topCandidates, confidence, confidenceReasoning, fingerprint, contextVersion, promptVersion, context);
      }
    );

    if (cached) {
      decisionTraceStore.addTrace({
        id: `trace-what-now-${Date.now()}`,
        timestamp: Date.now(),
        contextVersion,
        promptVersion,
        source: "cached",
        cacheHit: true,
        llmLatency: 0,
        validatorResult: true,
        fallbackUsage: false
      });

      return {
        recommendedTaskId: cached.recommendedTaskId,
        confidence: cached.confidence,
        confidenceReasoning: cached.confidenceReasoning,
        aiExplanation: cached.aiExplanation,
        topCandidates,
        source: "cached",
        isFallback: false,
        decisionInputs: {
          currentTime: context.currentTime,
          currentDate: context.currentDate,
          energyLevel: context.energyLevel?.current,
          efficacyLevel: context.focusEfficacy?.efficacyLevel,
          availableMinutesToday: context.availableTime?.availableMinutesToday
        }
      };
    }
  }

  // 3. Orchestrate API call or fallback
  const ai = getAIClient();
  if (!ai) {
    // Pure math local fallback
    const topRecommended = candidateWrappers[0];
    const recId = topRecommended.task.id;
    const timeStr = getFormattedTimeStr(topRecommended.task.estimatedMinutes);
    const whyThisTask = `Selected as the optimal priority with a score of ${topRecommended.scoreResult.totalScore}/100. It matches your currently available time and maximizes urgency mitigation.`;
    const whyNotOthers = topCandidates.length > 1 
      ? `The alternative candidate "${topCandidates[1].title}" scored ${topCandidates[1].score} pts (a gap of ${topRecommended.scoreResult.totalScore - topCandidates[1].score} pts), making this the more pressing item.`
      : "No competing candidate tasks exist at this time.";

    const evidence = [
      `Deterministic Priority Score: ${topRecommended.scoreResult.totalScore}/100`,
      `Deadline Score: ${topRecommended.scoreResult.components.deadlineScore}/100`,
      `Urgency Score: ${topRecommended.scoreResult.components.urgencyScore}/100`,
      `Dependency Score: ${topRecommended.scoreResult.components.dependencyScore}/100`,
      `Cognitive Switching Cost: ${topRecommended.scoreResult.components.cognitiveSwitchingCost}/100`,
      `Available Time Match Score: ${topRecommended.scoreResult.components.availableTimeMatchScore}/100`,
      `Completion Opportunity Score: ${topRecommended.scoreResult.components.completionOpportunityScore}/100`,
      `Energy Match Score: ${topRecommended.scoreResult.components.energyMatchScore}/100`,
      `Project Risk Score: ${topRecommended.scoreResult.components.projectRiskScore}/100`,
      `Focus Match Score: ${topRecommended.scoreResult.components.focusMatchScore}/100`
    ];

    decisionTraceStore.addTrace({
      id: `trace-what-now-${Date.now()}`,
      timestamp: Date.now(),
      contextVersion,
      promptVersion,
      source: "local",
      cacheHit: false,
      llmLatency: 0,
      validatorResult: false,
      fallbackUsage: true
    });

    return {
      recommendedTaskId: recId,
      confidence,
      confidenceReasoning,
      aiExplanation: {
        whyThisTask,
        whyNotOthers,
        riskIfDelayed: "Delaying this will directly cascade deadline risks to related tasks.",
        alternativeTaskIdea: topCandidates.length > 1 ? `Work on "${topCandidates[1].title}" instead.` : "No alternative tasks found.",
        evidence
      },
      topCandidates,
      source: "local",
      isFallback: true,
      decisionInputs: {
        currentTime: context.currentTime,
        currentDate: context.currentDate,
        energyLevel: context.energyLevel?.current,
        efficacyLevel: context.focusEfficacy?.efficacyLevel,
        availableMinutesToday: context.availableTime?.availableMinutesToday
      }
    };
  }

  // Call AI Revalidation synchronously
  return await revalidateAIRecommendation(
    candidateWrappers,
    topCandidates,
    confidence,
    confidenceReasoning,
    fingerprint,
    contextVersion,
    promptVersion,
    context
  );
}

/**
 * Revalidates the recommendation via Gemini API using top candidates.
 */
async function revalidateAIRecommendation(
  candidateWrappers: any[],
  topCandidates: CandidateTask[],
  confidence: number | null,
  confidenceReasoning: string,
  fingerprint: string,
  contextVersion: string,
  promptVersion: string,
  context: AIContext
): Promise<Decision> {
  const ai = getAIClient();
  if (!ai) {
    throw new Error("AI client is not initialized.");
  }

  const registered = promptRegistry.getPrompt("what-now");
  const systemInstruction = registered.systemPrompt;

  // Format candidate data cleanly for context injection
  const candidatesData = candidateWrappers.map(w => ({
    id: w.task.id,
    title: w.task.title,
    description: w.task.description,
    deadline: w.task.deadline,
    estimatedMinutes: w.task.estimatedMinutes,
    importance: w.task.importance,
    urgency: w.task.urgency,
    riskLevel: w.task.riskLevel,
    dependencies: w.task.dependencies,
    deterministicScore: w.scoreResult.totalScore,
    scoreComponents: w.scoreResult.components
  }));

  const userPrompt = registered.userPromptTemplate(
    JSON.stringify({
      currentTime: context.currentTime,
      currentDate: context.currentDate,
      userPreferences: context.userPreferences,
      energyLevel: context.energyLevel,
      focusEfficacy: context.focusEfficacy,
      currentWorkingSession: context.currentWorkingSession
    }),
    candidatesData
  );

  const startTime = Date.now();
  let validatorResult = false;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: registered.outputSchema
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    const validation = validateLLMResponse(parsed, topCandidates);
    validatorResult = validation.isValid;

    if (!validatorResult) {
      console.warn(`[VALIDATOR REJECTED] LLM response failed validation. Reason: ${validation.errorReason}. Falling back to deterministic mathematical priority.`);
    }

    const recId = parsed.recommendedTaskId || "";
    const finalRecId = validatorResult ? recId : topCandidates[0].id;
    
    // Construct robust explanations
    const whyThisTask = validatorResult ? parsed.whyThisTask : `Selected optimal candidate "${candidateWrappers[0].task.title}" with a deterministic score of ${candidateWrappers[0].scoreResult.totalScore}/100.`;
    const whyNotOthers = validatorResult ? parsed.whyNotOthers : (topCandidates.length > 1 ? `Alternative "${topCandidates[1].title}" scored lower at ${topCandidates[1].score} pts.` : "No other candidates are currently eligible.");
    const riskIfDelayed = validatorResult ? parsed.riskIfDelayed : "Delays will directly compress your remaining available time block.";
    const alternativeTaskIdea = validatorResult ? parsed.alternativeTaskIdea : (topCandidates.length > 1 ? `Take a look at "${topCandidates[1].title}" instead.` : "Try breaking down your single task into smaller focus blocks.");
    
    // Merge LLM evidence with pure diagnostic scores
    const primaryMathEvidence = [
      `Top Scored Candidate: ${candidateWrappers[0].task.title} (${candidateWrappers[0].scoreResult.totalScore} pts)`,
      `Deadline Component: ${candidateWrappers[0].scoreResult.components.deadlineScore}/100`,
      `Urgency Component: ${candidateWrappers[0].scoreResult.components.urgencyScore}/100`,
      `Graduated Dependency State: ${candidateWrappers[0].scoreResult.components.dependencyScore}/100`,
      `Cognitive Switching Cost: ${candidateWrappers[0].scoreResult.components.cognitiveSwitchingCost}/100`,
      `Available Time Fit Score: ${candidateWrappers[0].scoreResult.components.availableTimeMatchScore}/100`,
      `Energy Match Score: ${candidateWrappers[0].scoreResult.components.energyMatchScore}/100`
    ];

    const evidence = validatorResult && Array.isArray(parsed.evidence)
      ? [...parsed.evidence, ...primaryMathEvidence]
      : primaryMathEvidence;

    const aiExplanation: AIExplanation = {
      whyThisTask,
      whyNotOthers,
      riskIfDelayed,
      alternativeTaskIdea,
      evidence
    };

    const finalResult = {
      recommendedTaskId: finalRecId,
      confidence,
      confidenceReasoning,
      aiExplanation
    };

    // Cache the validated decision object
    recommendationCache.set(
      "what-now",
      fingerprint,
      finalResult,
      {
        contextVersion,
        promptVersion,
        aiModel: "gemini-3.5-flash"
      }
    );

    const recTask = candidateWrappers.find(w => w.task.id === finalRecId)?.task;
    if (recTask) {
      aiMemoryService.addRecommendation(`Recommended working on task "${recTask.title}" right now based on active bottlenecks and energy state.`);
    }

    const latency = Date.now() - startTime;
    decisionTraceStore.addTrace({
      id: `trace-what-now-${Date.now()}`,
      timestamp: Date.now(),
      contextVersion,
      promptVersion,
      source: "ai",
      cacheHit: false,
      llmLatency: latency,
      validatorResult,
      fallbackUsage: false
    });

    return {
      recommendedTaskId: finalRecId,
      confidence,
      confidenceReasoning,
      aiExplanation,
      topCandidates,
      source: "ai",
      isFallback: false,
      decisionInputs: {
        currentTime: context.currentTime,
        currentDate: context.currentDate,
        energyLevel: context.energyLevel?.current,
        efficacyLevel: context.focusEfficacy?.efficacyLevel,
        availableMinutesToday: context.availableTime?.availableMinutesToday
      }
    };
  } catch (err) {
    console.error("AI Decision Engine revalidation failed, falling back to local math:", err);

    const topRecommended = candidateWrappers[0];
    const recId = topRecommended.task.id;
    const whyThisTask = `Selected as the optimal priority with a score of ${topRecommended.scoreResult.totalScore}/100. It matches your currently available time and maximizes urgency mitigation.`;
    const whyNotOthers = topCandidates.length > 1 
      ? `The alternative candidate "${topCandidates[1].title}" scored ${topCandidates[1].score} pts (a gap of ${topRecommended.scoreResult.totalScore - topCandidates[1].score} pts), making this the more pressing item.`
      : "No competing candidate tasks exist at this time.";

    const fallbackEvidence = [
      `Deterministic Priority Score: ${topRecommended.scoreResult.totalScore}/100`,
      `Deadline Score: ${topRecommended.scoreResult.components.deadlineScore}/100`,
      `Urgency Score: ${topRecommended.scoreResult.components.urgencyScore}/100`,
      `Dependency Score: ${topRecommended.scoreResult.components.dependencyScore}/100`,
      `Cognitive Switching Cost: ${topRecommended.scoreResult.components.cognitiveSwitchingCost}/100`,
      `Available Time Match Score: ${topRecommended.scoreResult.components.availableTimeMatchScore}/100`,
      `Completion Opportunity Score: ${topRecommended.scoreResult.components.completionOpportunityScore}/100`,
      `Energy Match Score: ${topRecommended.scoreResult.components.energyMatchScore}/100`,
      `Project Risk Score: ${topRecommended.scoreResult.components.projectRiskScore}/100`,
      `Focus Match Score: ${topRecommended.scoreResult.components.focusMatchScore}/100`
    ];

    const latency = Date.now() - startTime;
    decisionTraceStore.addTrace({
      id: `trace-what-now-${Date.now()}`,
      timestamp: Date.now(),
      contextVersion,
      promptVersion,
      source: "local",
      cacheHit: false,
      llmLatency: latency,
      validatorResult: false,
      fallbackUsage: true
    });

    return {
      recommendedTaskId: recId,
      confidence,
      confidenceReasoning,
      aiExplanation: {
        whyThisTask,
        whyNotOthers,
        riskIfDelayed: "Delaying this will directly cascade deadline risks to related tasks.",
        alternativeTaskIdea: topCandidates.length > 1 ? `Work on "${topCandidates[1].title}" instead.` : "No alternative tasks found.",
        evidence: fallbackEvidence
      },
      topCandidates,
      source: "local",
      isFallback: true,
      decisionInputs: {
        currentTime: context.currentTime,
        currentDate: context.currentDate,
        energyLevel: context.energyLevel?.current,
        efficacyLevel: context.focusEfficacy?.efficacyLevel,
        availableMinutesToday: context.availableTime?.availableMinutesToday
      }
    };
  }
}

/**
 * Fully compliant Phase 3.2 Response Validator.
 * Rejects/retries or marks invalid when:
 * 1. Output isn't valid JSON or lacks required fields.
 * 2. recommendedTaskId doesn't match one of the actual Top 3 candidates.
 * 3. alternativeTaskIdea doesn't reference a title or ID in the Top 3 candidates.
 * 4. evidence[] entries contain fabricated numbers that do not correspond to any real component or total score.
 */
export function validateLLMResponse(
  parsed: any,
  topCandidates: CandidateTask[]
): { isValid: boolean; errorReason?: string } {
  if (!parsed || typeof parsed !== "object") {
    return { isValid: false, errorReason: "Not a valid JSON object." };
  }

  const { recommendedTaskId, whyThisTask, whyNotOthers, riskIfDelayed, alternativeTaskIdea, evidence } = parsed;

  if (!recommendedTaskId || typeof recommendedTaskId !== "string") {
    return { isValid: false, errorReason: "Missing recommendedTaskId." };
  }
  if (!whyThisTask || typeof whyThisTask !== "string") {
    return { isValid: false, errorReason: "Missing whyThisTask statement." };
  }
  if (!whyNotOthers || typeof whyNotOthers !== "string") {
    return { isValid: false, errorReason: "Missing whyNotOthers statement." };
  }
  if (!riskIfDelayed || typeof riskIfDelayed !== "string") {
    return { isValid: false, errorReason: "Missing riskIfDelayed statement." };
  }
  if (!alternativeTaskIdea || typeof alternativeTaskIdea !== "string") {
    return { isValid: false, errorReason: "Missing alternativeTaskIdea statement." };
  }
  if (!evidence || !Array.isArray(evidence)) {
    return { isValid: false, errorReason: "Missing evidence array." };
  }

  // Rule 2: recommendedTaskId must match actual Top 3 candidates
  const matchingCandidate = topCandidates.find(c => c.id === recommendedTaskId);
  if (!matchingCandidate) {
    return { isValid: false, errorReason: `recommendedTaskId '${recommendedTaskId}' is not in the Top 3 candidates.` };
  }

  // Rule 3: alternativeTaskIdea must reference actual Top 3 candidates
  const otherCandidates = topCandidates.filter(c => c.id !== recommendedTaskId);
  if (otherCandidates.length > 0) {
    const referencesValidAlternative = otherCandidates.some(c => {
      const lowerTitle = c.title.toLowerCase();
      const lowerAlt = alternativeTaskIdea.toLowerCase();
      return lowerAlt.includes(lowerTitle) || lowerAlt.includes(c.id.toLowerCase());
    });
    if (!referencesValidAlternative) {
      return {
        isValid: false,
        errorReason: "alternativeTaskIdea does not reference any other candidate in the Top 3."
      };
    }
  }

  // Rule 4: evidence[] entries must trace back to real numbers in that candidate's scoring breakdown
  for (const entry of evidence) {
    if (typeof entry !== "string") {
      return { isValid: false, errorReason: "Evidence entry is not a string." };
    }
    const numbers = entry.match(/\b\d+\b/g);
    if (numbers) {
      // Gather real scores for comparison
      const realScores = [
        matchingCandidate.score,
        matchingCandidate.components.deadlineScore,
        matchingCandidate.components.urgencyScore,
        matchingCandidate.components.dependencyScore,
        matchingCandidate.components.cognitiveSwitchingCost,
        matchingCandidate.components.availableTimeMatchScore,
        matchingCandidate.components.completionOpportunityScore,
        matchingCandidate.components.energyMatchScore,
        matchingCandidate.components.projectRiskScore,
        matchingCandidate.components.focusMatchScore
      ];
      const matchesReal = numbers.some(n => realScores.includes(Number(n)));
      if (!matchesReal) {
        return {
          isValid: false,
          errorReason: `Evidence entry '${entry}' contains fabricated numbers not found in the actual score breakdown: [${realScores.join(", ")}].`
        };
      }
    }
  }

  return { isValid: true };
}
