export interface Subtask {
  id: string;
  text: string;
  done: boolean;
  estimatedMinutes?: number;
  difficulty?: "Easy" | "Medium" | "Hard";
  priority?: "Low" | "Medium" | "High";
  dependencies?: string[]; // subtask IDs
  executionOrder?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  deadline: string; // ISO String
  estimatedMinutes: number;
  importance: "Low" | "Medium" | "High"; // Standard Priority level
  status: "pending" | "completed";
  createdAt: string;
  urgency?: "Relaxed" | "Normal" | "Important" | "Urgent" | "Critical";

  // Smart Task System - Phase 3 additions
  difficulty: "Easy" | "Medium" | "Hard";
  focusRequirement: "Low Focus" | "Medium Focus" | "High Focus" | "Deep Focus";
  energyRequirement: "Low" | "Medium" | "High";
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  completionProbability: number; // 0-100 percentage
  dependencies: string[]; // parent task IDs that must be completed
  tags: string[];
  project: string;
  aiSummary: string | null;
  progress: number; // 0-100 percentage completed
  contextNotes?: string | null;

  // AI elements (populated via Gemini)
  priorityScore: number | null; // 0-100
  priorityLabel: "High" | "Medium" | "Low" | null;
  priorityReasoning: string | null;

  // Breakdown subtasks (cached)
  subtasks: Subtask[] | null;
  aiBreakdownInsight: string | null;
  suggestedResource: {
    title: string;
    readTime: string;
  } | null;
}

export interface AIPlannerSuggestion {
  title: string;
  estimatedMinutes: number;
  importance: "Low" | "Medium" | "High";
  description: string;
}

export interface AIPlannerResponse {
  responseText: string;
  suggestedTasks: AIPlannerSuggestion[];
}

export type FocusSessionOutcome = "completed" | "abandoned" | "overrun" | "cancelled";

export interface FocusSession {
  id: string;
  taskId: string | null;
  startedAt: string; // ISO String
  endedAt: string | null; // ISO String
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  outcome: FocusSessionOutcome | null; // null if active
  interruptionCount: number;
  pauseCount: number;
  totalPausedMinutes: number;
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
}
