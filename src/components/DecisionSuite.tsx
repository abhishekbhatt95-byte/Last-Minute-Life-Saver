import React, { useState } from "react";
import { motion } from "motion/react";
import { getDeadlineBucketScore } from "../../decisionScoring";

export interface CandidateTask {
  id: string;
  title: string;
  score: number;
  components: {
    deadlineScore: number;
    urgencyScore: number;
    dependencyScore: number;
    cognitiveSwitchingCost: number;
    availableTimeMatchScore: number;
    completionOpportunityScore: number;
    energyMatchScore: number;
    projectRiskScore: number;
    focusMatchScore: number;
  };
}

export interface AIExplanation {
  whyThisTask: string;
  whyNotOthers: string;
  riskIfDelayed: string;
  alternativeTaskIdea: string;
  evidence: string[];
}

interface DecisionSuiteProps {
  recommendation: {
    id: string | null;
    title: string;
    confidence: number | null;
    confidenceReasoning: string;
    aiExplanation: AIExplanation | null;
    topCandidates: CandidateTask[];
    source: "ai" | "cached" | "local";
    isFallback: boolean;
  };
  tasks: any[];
  onClose: () => void;
  onStartTask: (id: string) => void;
}

/**
 * Projects skip risk using actual deadlineScore logic from decisionScoring.ts
 */
export function simulateSkipRisk(task: any, nowMs: number) {
  if (!task || !task.deadline) {
    return {
      todayRisk: 20,
      tomorrowRisk: 30,
      checkpointRisk: 50,
      todayScore: 35,
      tomorrowScore: 45,
      checkpointScore: 65,
      recommendation: "Stable profile. This task lacks a strict calendar deadline, so urgency growth is linear."
    };
  }

  const dMs = new Date(task.deadline).getTime();
  
  const getRecommendation = (score: number) => {
    if (score >= 90) return "BREACH IMMINENT: Deferral is critical. Start immediately to prevent operational failure.";
    if (score >= 70) return "HIGH RISK: Cascading delays will lock downstream milestones.";
    if (score >= 50) return "MODERATE RISK: Deadline is tightening; plan to initiate in the next block.";
    return "STABLE: Standard priority. You can safely defer to a subsequent block.";
  };

  const diffToday = (dMs - nowMs) / (1000 * 60 * 60 * 24);
  const diffTomorrow = diffToday - 1;
  const diffCheckpoint = diffToday - 3;

  const todayRisk = getDeadlineBucketScore(diffToday);
  const tomorrowRisk = getDeadlineBucketScore(diffTomorrow);
  const checkpointRisk = getDeadlineBucketScore(diffCheckpoint);

  return {
    todayRisk,
    tomorrowRisk,
    checkpointRisk,
    todayScore: Math.min(100, todayRisk + 10),
    tomorrowScore: Math.min(100, tomorrowRisk + 20),
    checkpointScore: Math.min(100, checkpointRisk + 30),
    recommendation: getRecommendation(checkpointRisk)
  };
}

export default function DecisionSuite({ recommendation, tasks, onClose, onStartTask }: DecisionSuiteProps) {
  const [activeSubTab, setActiveSubTab] = useState<"card" | "simulator" | "comparison">("card");
  
  const selectedTaskObj = tasks.find(t => t.id === recommendation.id);
  const nowMs = Date.now();
  const simulation = simulateSkipRisk(selectedTaskObj, nowMs);

  const getFormattedTimeStr = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    return hours > 0 ? `~${hours}h ${m}m` : `~${m}m`;
  };

  return (
    <div className="space-y-5">
      {/* Tab Selectors */}
      <div className="flex border-b border-white/5 pb-2 gap-2">
        <button
          onClick={() => setActiveSubTab("card")}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
            activeSubTab === "card"
              ? "bg-[#14b8a6]/10 text-[#14b8a6] border border-[#14b8a6]/20"
              : "text-[#c7c4d7]/60 hover:text-white"
          }`}
        >
          Decision Card
        </button>
        <button
          onClick={() => setActiveSubTab("simulator")}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
            activeSubTab === "simulator"
              ? "bg-[#14b8a6]/10 text-[#14b8a6] border border-[#14b8a6]/20"
              : "text-[#c7c4d7]/60 hover:text-white"
          }`}
        >
          What-If Simulator
        </button>
        <button
          onClick={() => setActiveSubTab("comparison")}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
            activeSubTab === "comparison"
              ? "bg-[#14b8a6]/10 text-[#14b8a6] border border-[#14b8a6]/20"
              : "text-[#c7c4d7]/60 hover:text-white"
          }`}
        >
          Rank Comparison
        </button>
      </div>

      {/* SUB-TAB 1: DECISION CARD */}
      {activeSubTab === "card" && (
        <div className="space-y-4">
          {/* Fallback & Confidence Integrity Visual Banner */}
          {recommendation.isFallback || recommendation.source === "local" ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">info</span>
              <span>
                <strong>Local Heuristics Only:</strong> Live Gemini connection unavailable. Decided via deterministic scoring breakdown.
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[#14b8a6]/10 border border-[#14b8a6]/20 text-xs text-[#14b8a6] flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              <span>
                <strong>Co-Pilot Recommendation Verified:</strong> Gemini 3.5 models analyzed deterministic top-scorers.
              </span>
            </div>
          )}

          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#c7c4d7]/60 block mb-1">Do Next</span>
            <h3 className="font-bold text-xl text-white tracking-tight">{recommendation.title}</h3>
            
            {recommendation.confidence !== null ? (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#c7c4d7]/70 font-mono text-[10px]">Decision Confidence</span>
                  <span className="text-[#14b8a6] font-mono font-bold">{recommendation.confidence}%</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="bg-gradient-to-r from-[#14b8a6]/40 to-[#14b8a6] h-full transition-all duration-500" 
                    style={{ width: `${recommendation.confidence}%` }}
                  />
                </div>
                <p className="text-[9px] font-mono text-[#c7c4d7]/50 leading-tight">
                  {recommendation.confidenceReasoning}
                </p>
              </div>
            ) : (
              <span className="text-[10px] font-mono text-amber-400 block mt-1">Local heuristic — no AI confidence</span>
            )}
          </div>

          {/* Core Reasoning / Evidence Block */}
          {recommendation.aiExplanation && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-[#14b8a6]/5 border border-[#14b8a6]/10 text-xs text-[#c7c4d7] leading-relaxed space-y-2">
                <strong className="text-white block font-semibold">Because:</strong>
                <p>{recommendation.aiExplanation.whyThisTask}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#14b8a6]">Estimated Duration</span>
                  <p className="text-white font-medium">
                    {selectedTaskObj ? getFormattedTimeStr(selectedTaskObj.estimatedMinutes) : "~45m"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400">Risk if Ignored</span>
                  <p className="text-[#c7c4d7]/90 text-[11px] leading-snug">{recommendation.aiExplanation.riskIfDelayed}</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#3b82f6]/5 border border-[#3b82f6]/10 text-xs">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#3b82f6] block mb-1">Alternative Suggestion</span>
                <p className="text-[#c7c4d7]/80 text-[11px] leading-snug">{recommendation.aiExplanation.alternativeTaskIdea}</p>
              </div>

              {/* Concrete Evidence List */}
              {recommendation.aiExplanation.evidence && recommendation.aiExplanation.evidence.length > 0 && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#c7c4d7] block">Mathematical Evidence Breakdown</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px] font-mono text-[#c7c4d7]/75">
                    {recommendation.aiExplanation.evidence.map((ev, i) => (
                      <div key={i} className="flex items-center gap-1.5 truncate">
                        <span className="text-[#14b8a6]">▸</span>
                        <span className="truncate">{ev}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-white/5">
            <button
              onClick={() => setActiveSubTab("comparison")}
              className="flex-1 py-2.5 bg-[#1e1f26] hover:bg-[#33343b] rounded-lg text-xs font-semibold border border-white/10 text-[#c7c4d7] cursor-pointer text-center"
            >
              Show Alternatives
            </button>
            <button
              onClick={() => {
                if (recommendation.id) {
                  onStartTask(recommendation.id);
                }
              }}
              className="flex-1 py-2.5 bg-[#14b8a6] hover:bg-[#14b8a6]/90 text-[#022c22] font-bold text-xs rounded-lg transition-all cursor-pointer text-center"
            >
              Start Working
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: DECISION SIMULATOR ("What if I skip this?") */}
      {activeSubTab === "simulator" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 text-xs space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 block font-bold">Simulator: skip work projection</span>
            <p className="text-[#c7c4d7] leading-relaxed">
              If you skip <strong>"{recommendation.title}"</strong> today, let's see how urgency, deadline risk indicators, and operational backlogs cascade over time.
            </p>
          </div>

          {/* Timeline Projections */}
          <div className="space-y-3 font-mono text-xs">
            {/* Skip Today */}
            <div className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5">
              <div className="space-y-1">
                <span className="text-white font-bold block">1. Skip Today</span>
                <span className="text-[#c7c4d7]/60 text-[10px]">Normal operation parameters</span>
              </div>
              <div className="text-right">
                <span className="text-[#14b8a6] font-bold block">Risk: {simulation.todayRisk}%</span>
                <span className="text-[#c7c4d7]/50 text-[10px]">Score: {simulation.todayScore}/100</span>
              </div>
            </div>

            {/* Skip Tomorrow */}
            <div className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5">
              <div className="space-y-1">
                <span className="text-amber-400 font-bold block">2. Skip Tomorrow</span>
                <span className="text-[#c7c4d7]/60 text-[10px]">Lead block compressed by 24h</span>
              </div>
              <div className="text-right">
                <span className="text-amber-400 font-bold block">Risk: {simulation.tomorrowRisk}%</span>
                <span className="text-[#c7c4d7]/50 text-[10px]">Score: {simulation.tomorrowScore}/100</span>
              </div>
            </div>

            {/* Next Checkpoint / 3 Days */}
            <div className="flex justify-between items-center p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
              <div className="space-y-1">
                <span className="text-rose-400 font-bold block">3. Skip 3 Days</span>
                <span className="text-[#c7c4d7]/60 text-[10px]">Next review milestone</span>
              </div>
              <div className="text-right">
                <span className="text-rose-400 font-bold block">Risk: {simulation.checkpointRisk}%</span>
                <span className="text-[#c7c4d7]/50 text-[10px]">Score: {simulation.checkpointScore}/100</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#c7c4d7] block">Simulator Recommendation</span>
            <p className="text-xs text-[#c7c4d7] leading-relaxed">
              {simulation.recommendation}
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t border-white/5">
            <button
              onClick={() => setActiveSubTab("card")}
              className="flex-1 py-2.5 bg-[#1e1f26] hover:bg-[#33343b] rounded-lg text-xs font-semibold border border-white/10 text-[#c7c4d7] cursor-pointer"
            >
              Back to Decision
            </button>
            <button
              onClick={() => {
                if (recommendation.id) {
                  onStartTask(recommendation.id);
                }
              }}
              className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer text-center"
            >
              Mitigate Risk Now
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: DECISION COMPARISON */}
      {activeSubTab === "comparison" && (
        <div className="space-y-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#c7c4d7]/60 block mb-1">
            Top 3 Ranked Candidates Comparison
          </span>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recommendation.topCandidates.map((cand, idx) => {
              const isSelected = cand.id === recommendation.id;
              return (
                <div
                  key={cand.id}
                  className={`p-3 rounded-xl border flex flex-col justify-between space-y-3 ${
                    isSelected
                      ? "bg-[#14b8a6]/5 border-[#14b8a6]/30 shadow-[0_0_15px_rgba(20,184,166,0.05)]"
                      : "bg-white/5 border-white/5"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] font-mono text-[#c7c4d7]/40">Rank #{idx + 1}</span>
                      <span className={`text-[10px] font-mono font-bold ${isSelected ? "text-[#14b8a6]" : "text-[#c7c4d7]"}`}>
                        {cand.score} pts
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white mt-1 truncate">{cand.title}</h4>
                  </div>

                  {/* Complete 9-component breakdowns */}
                  {cand.components && (
                    <div className="space-y-1 border-t border-white/5 pt-2 text-[9px] font-mono text-[#c7c4d7]/70">
                      <div className="flex justify-between">
                        <span>Deadline:</span>
                        <span>{cand.components.deadlineScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Urgency:</span>
                        <span>{cand.components.urgencyScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Dependency:</span>
                        <span>{cand.components.dependencyScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Switching:</span>
                        <span>{cand.components.cognitiveSwitchingCost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Time Fit:</span>
                        <span>{cand.components.availableTimeMatchScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Opportunity:</span>
                        <span>{cand.components.completionOpportunityScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Energy Match:</span>
                        <span>{cand.components.energyMatchScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Risk Level:</span>
                        <span>{cand.components.projectRiskScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Focus Match:</span>
                        <span>{cand.components.focusMatchScore}</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      onStartTask(cand.id);
                    }}
                    className={`w-full py-1.5 text-[10px] font-bold rounded transition-all cursor-pointer text-center ${
                      isSelected
                        ? "bg-[#14b8a6] hover:bg-[#14b8a6]/90 text-[#022c22]"
                        : "bg-white/10 hover:bg-white/20 text-white"
                    }`}
                  >
                    Select Rank #{idx + 1}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2 border-t border-white/5">
            <button
              onClick={() => setActiveSubTab("card")}
              className="py-2 px-4 bg-[#1e1f26] hover:bg-[#33343b] rounded-lg text-xs font-semibold border border-white/10 text-[#c7c4d7] cursor-pointer"
            >
              Back to Card
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
