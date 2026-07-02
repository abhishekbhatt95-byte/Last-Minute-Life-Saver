import { Type } from "@google/genai";

export interface VersionedPrompt {
  id: string;
  version: string;
  systemPrompt: string;
  userPromptTemplate: (contextStr: string, data: any) => string;
  outputSchema: any;
}

class PromptRegistry {
  private prompts = new Map<string, VersionedPrompt>();

  constructor() {
    this.registerPrompts();
  }

  private registerPrompts() {
    this.prompts.set("prioritization", {
      id: "prioritization",
      version: "prioritization_v1.0",
      systemPrompt: "You are Life Saver AI, an expert real-time productivity coach. Rank tasks by optimal priority score (0 to 100), label them ('High', 'Medium', or 'Low'), and provide a 1-sentence reasoning explaining 'Why this matters now'.",
      userPromptTemplate: (contextStr, data) => `Use the comprehensive system and productivity context below to make highly accurate, holistic prioritization decisions:
${contextStr}

Tasks list:
${JSON.stringify(data)}

Return a JSON array of prioritized tasks containing ONLY the prioritized scores, labels, and reasoning.
Do not alter titles, deadlines, or anything else. Just prioritize.`,
      outputSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            priorityScore: { type: Type.INTEGER, description: "A value from 0 to 100" },
            priorityLabel: { type: Type.STRING, description: "High, Medium, or Low" },
            priorityReasoning: { type: Type.STRING, description: "A concise 1-sentence explanation of why this is prioritized" }
          },
          required: ["id", "priorityScore", "priorityLabel", "priorityReasoning"]
        }
      }
    });

    this.prompts.set("what-now", {
      id: "what-now",
      version: "whatnow_v2.0",
      systemPrompt: "You are Life Saver AI, an expert real-time productivity coach. Recommend EXACTLY ONE pending task that the user should start working on RIGHT NOW based on their holistic, real-time context and deterministic scoring candidates. Be highly analytical, referencing the candidate scores and specific components to explain why it is the optimal choice.",
      userPromptTemplate: (contextStr, data) => `Review the user's available time, cognitive energy levels, focus success rate, and active bottlenecks in their overall operating system profile:
${contextStr}

Candidates list (Top 3 deterministically scored pending tasks):
${JSON.stringify(data)}

Return JSON with the recommended task ID, detailed explanation components, concrete score evidence, and formatted estimated duration string.`,
      outputSchema: {
        type: Type.OBJECT,
        properties: {
          recommendedTaskId: { type: Type.STRING },
          whyThisTask: { type: Type.STRING, description: "Detailed reasoning for selecting this task" },
          whyNotOthers: { type: Type.STRING, description: "Why the other top candidates were not selected as the absolute priority" },
          riskIfDelayed: { type: Type.STRING, description: "Specific risks to deadlines or projects if this is postponed" },
          alternativeTaskIdea: { type: Type.STRING, description: "A productive alternative task suggestion from the candidates if cognitive fatigue sets in" },
          evidence: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Concrete numeric data points or facts pulled directly from the provided candidate scores and components"
          },
          estimatedTimeStr: { type: Type.STRING, description: "Formatted string like '~2h 30m'" }
        },
        required: [
          "recommendedTaskId",
          "whyThisTask",
          "whyNotOthers",
          "riskIfDelayed",
          "alternativeTaskIdea",
          "evidence",
          "estimatedTimeStr"
        ]
      }
    });
  }

  getPrompt(id: string): VersionedPrompt {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      throw new Error(`Prompt with id "${id}" is not registered in the Prompt Registry.`);
    }
    return prompt;
  }
}

export const promptRegistry = new PromptRegistry();
