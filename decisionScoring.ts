import { Task } from "./src/types";
import { AIContext } from "./contextBuilder";

export interface ScoringComponents {
  deadlineScore: number;
  urgencyScore: number;
  dependencyScore: number;
  cognitiveSwitchingCost: number;
  availableTimeMatchScore: number;
  completionOpportunityScore: number;
  energyMatchScore: number;
  projectRiskScore: number;
  focusMatchScore: number;
}

export interface ScoringResult {
  totalScore: number;
  components: ScoringComponents;
  isBlocked: boolean;
}

/**
 * Calculates bucketed deadline score given difference in days.
 */
export function getDeadlineBucketScore(diffDays: number): number {
  if (diffDays < 0) return 100; // Overdue
  if (diffDays < 1) return 90;  // < 24h
  if (diffDays <= 3) return 70; // 24h - 72h
  if (diffDays <= 7) return 50; // 3 - 7 days
  if (diffDays <= 14) return 30; // 7 - 14 days
  return 10; // 14+ days
}

/**
 * Deterministic scoring engine for Last-Minute Life Saver tasks.
 * Complies strictly with the approved 9-component spec (Phase 3.2).
 * Pure math, synchronous, with zero external network or model dependency.
 */
export function scoreTask(task: Task, context: AIContext, allTasks: Task[]): ScoringResult {
  // 1. deadlineScore (Weight: 20%)
  // Bucketed based on remaining time
  const nowMs = new Date().getTime();
  let deadlineScore = 20; // default for null/missing deadline
  
  if (task.deadline) {
    const dMs = new Date(task.deadline).getTime();
    const diffDays = (dMs - nowMs) / (1000 * 60 * 60 * 24);
    deadlineScore = getDeadlineBucketScore(diffDays);
  }

  // 2. urgencyScore (Weight: 15%)
  // Uses 5-tier urgency with approved value mappings
  let urgencyScore = 25; // Default (Normal)
  switch (task.urgency) {
    case "Critical":
      urgencyScore = 100;
      break;
    case "Urgent":
      urgencyScore = 75;
      break;
    case "Important":
      urgencyScore = 50;
      break;
    case "Normal":
      urgencyScore = 25;
      break;
    case "Relaxed":
      urgencyScore = 0;
      break;
    default:
      urgencyScore = 25;
  }

  // 3. dependencyScore (Weight: 10%)
  // Graduated states to avoid binary-veto:
  // - Blocked (pending dependencies exist) -> 0
  // - No Dependency (no relations) -> 50
  // - Blocks Others (dependency anchor) -> 100
  // - BOTH blocked and blocking others -> 30
  const isBlocked = !!(task.dependencies && task.dependencies.some(parentId => {
    const parentTask = allTasks.find(t => t.id === parentId);
    return parentTask && parentTask.status === "pending";
  }));

  const isBlocking = allTasks.some(t => 
    t.status === "pending" && t.dependencies && t.dependencies.includes(task.id)
  );

  let dependencyScore = 50; // default
  if (isBlocked && isBlocking) {
    dependencyScore = 30;
  } else if (isBlocked) {
    dependencyScore = 0;
  } else if (isBlocking) {
    dependencyScore = 100;
  } else {
    dependencyScore = 50;
  }

  // 4. cognitiveSwitchingCost (Weight: 10%)
  // If an active session is in-progress, we reward staying on it (100) and penalize switching (0)
  let cognitiveSwitchingCost = 50; // neutral default when no active session
  if (context.currentWorkingSession && context.currentWorkingSession.isActive) {
    if (task.id === context.currentWorkingSession.taskId) {
      cognitiveSwitchingCost = 100;
    } else {
      cognitiveSwitchingCost = 0;
    }
  }

  // 5. availableTimeMatchScore (Weight: 10%)
  const S = context.availableTime?.availableMinutesToday ?? 0;
  const T = task.estimatedMinutes || 45;
  let availableTimeMatchScore = 50; // neutral default if S === 0

  if (S > 0) {
    if (T <= S) {
      availableTimeMatchScore = Math.round((T / S) * 100);
    } else {
      availableTimeMatchScore = Math.max(0, Math.round(100 - (T - S) * 2));
    }
  }

  // 6. completionOpportunityScore (Weight: 10%)
  // Rewards clearing short, low-effort tasks (quick wins)
  const MAX_QUICK_WIN_MINUTES = 30;
  const durationMinutes = task.estimatedMinutes || 45;
  const completionOpportunityScore = Math.max(0, Math.round(100 - Math.min(100, (durationMinutes / MAX_QUICK_WIN_MINUTES) * 100)));

  // 7. energyMatchScore (Weight: 10%)
  // Maps current user energy (Low/Medium/High) and task energy (Low/Medium/High) to values (20/50/80)
  // energyMatchScore = 100 - abs(userEnergyValue - taskEnergyValue)
  const userEnergyStr = context.energyLevel?.current ?? "Medium";
  const taskEnergyStr = task.energyRequirement ?? "Medium";
  
  const mapEnergyToValue = (energy: string): number => {
    if (energy === "High") return 80;
    if (energy === "Medium") return 50;
    return 20; // Low
  };

  const userEnergyValue = mapEnergyToValue(userEnergyStr);
  const taskEnergyValue = mapEnergyToValue(taskEnergyStr);
  const energyMatchScore = 100 - Math.abs(userEnergyValue - taskEnergyValue);

  // 8. projectRiskScore (Weight: 10%)
  // Mapped from project risk level or task risk level
  // No associated risk -> 50
  let projectRiskScore = 50;
  if (task.riskLevel) {
    switch (task.riskLevel) {
      case "Critical":
        projectRiskScore = 100;
        break;
      case "High":
        projectRiskScore = 80;
        break;
      case "Medium":
        projectRiskScore = 50;
        break;
      case "Low":
        projectRiskScore = 20;
        break;
      default:
        projectRiskScore = 50;
    }
  }

  // 9. focusMatchScore (Weight: 5%)
  // Based on success rate of past focus sessions
  const totalSessions = context.focusHistory?.length ?? 0;
  const successfulSessions = context.focusHistory?.filter(s => 
    s.outcome === "completed" || s.outcome === "overrun"
  ).length ?? 0;

  const focusMatchScore = totalSessions === 0 ? 50 : Math.round((successfulSessions / totalSessions) * 100);

  // Literal weighted arithmetic
  const weightedSum =
    (deadlineScore * 0.20) +
    (urgencyScore * 0.15) +
    (dependencyScore * 0.10) +
    (cognitiveSwitchingCost * 0.10) +
    (availableTimeMatchScore * 0.10) +
    (completionOpportunityScore * 0.10) +
    (energyMatchScore * 0.10) +
    (projectRiskScore * 0.10) +
    (focusMatchScore * 0.05);

  const finalScore = Math.round(weightedSum);

  return {
    totalScore: finalScore,
    components: {
      deadlineScore,
      urgencyScore,
      dependencyScore,
      cognitiveSwitchingCost,
      availableTimeMatchScore,
      completionOpportunityScore,
      energyMatchScore,
      projectRiskScore,
      focusMatchScore
    },
    isBlocked
  };
}
