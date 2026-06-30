export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  deadline: string; // ISO String
  estimatedMinutes: number;
  importance: "Low" | "Medium" | "High";
  status: "pending" | "completed";
  createdAt: string;

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
