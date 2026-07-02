import { Task, Subtask } from "./src/types";
import { aiMemoryService } from "./aiMemoryService";

export interface AIContext {
  currentTime: string;
  currentDate: string;
  tasks: {
    pending: Array<{
      id: string;
      title: string;
      description: string;
      deadline: string;
      estimatedMinutes: number;
      importance: "Low" | "Medium" | "High";
      urgency: string;
      priorityScore: number | null;
      priorityLabel: string | null;
      dependencies: string[];
      tags: string[];
      project: string;
      progress: number;
    }>;
    completed: Array<{
      id: string;
      title: string;
      description: string;
      completedAt?: string;
      project: string;
    }>;
  };
  projects: Array<{
    name: string;
    totalTasks: number;
    completedTasks: number;
    pendingMinutes: number;
  }>;
  deadlines: {
    overdueCount: number;
    dueTodayCount: number;
    dueTomorrowCount: number;
    dueThisWeekCount: number;
    upcomingDeadlines: Array<{ taskId: string; title: string; hoursLeft: number }>;
  };
  calendar: {
    todayEvents: Array<{ title: string; startTime: string; endTime: string; type: string }>;
  };
  urgency: {
    criticalCount: number;
    urgentCount: number;
    importantCount: number;
    normalCount: number;
    relaxedCount: number;
  };
  priority: {
    topPriorityTaskId: string | null;
    topPriorityTaskTitle: string | null;
    highPriorityCount: number;
    mediumPriorityCount: number;
    lowPriorityCount: number;
  };
  dependencies: {
    blockedTaskIds: string[];
    blockingTaskIds: string[];
    bottlenecks: Array<{ taskId: string; title: string; blockingCount: number }>;
    dependencyChains: string[][];
  };
  availableTime: {
    availableMinutesToday: number;
    totalPendingTaskMinutes: number;
    isOverloaded: boolean;
  };
  focusHistory: Array<{
    id: string;
    taskId: string | null;
    plannedDurationMinutes: number;
    actualDurationMinutes: number;
    outcome: string;
    createdAt: string;
  }>;
  focusEfficacy: {
    completionRate: number;
    abandonedRate: number;
    averageSessionMinutes: number;
    efficacyScore: number;
    efficacyLevel: "Excellent" | "High" | "Moderate" | "Needs Improvement";
  };
  recentAIRecommendations: string[];
  aiMemory: string[];
  userPreferences: {
    preferredFocusDuration: number;
    dailyTargetMinutes: number;
    preferredWorkingHours: string;
    coachingTone: string;
  };
  energyLevel: {
    current: "Low" | "Medium" | "High";
    recommendation: string;
  };
  currentWorkingSession: {
    isActive: boolean;
    taskId: string | null;
    taskTitle: string | null;
    startedAt: string | null;
    plannedMinutes: number | null;
    elapsedMinutes: number | null;
  };
}

// In-memory Context State maintained on the server
export const contextState = {
  focusHistory: [] as any[],
  userPreferences: {
    preferredFocusDuration: 25,
    dailyTargetMinutes: 240,
    preferredWorkingHours: "09:00 - 18:00",
    coachingTone: "Encouraging but highly disciplined, realistic"
  },
  energyLevel: "High" as "Low" | "Medium" | "High",
  currentWorkingSession: null as any | null
};

// Build the structured context object
export function buildAIContext(allTasks: Task[], customOverrides?: Partial<AIContext>): AIContext {
  const now = new Date();
  
  // Format dates/times
  const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const currentDate = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Filter pending vs completed tasks
  const pendingTasks = allTasks.filter(t => t.status === "pending");
  const completedTasks = allTasks.filter(t => t.status === "completed");

  // Map pending tasks
  const mappedPending = pendingTasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description || "",
    deadline: t.deadline,
    estimatedMinutes: t.estimatedMinutes,
    importance: t.importance,
    urgency: t.urgency || "Normal",
    priorityScore: t.priorityScore,
    priorityLabel: t.priorityLabel,
    dependencies: t.dependencies || [],
    tags: t.tags || [],
    project: t.project || "General",
    progress: t.progress || 0
  }));

  // Map completed tasks
  const mappedCompleted = completedTasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description || "",
    project: t.project || "General"
  }));

  // Projects derivation
  const projectMap = new Map<string, { total: number; completed: number; mins: number }>();
  allTasks.forEach(t => {
    const proj = t.project || "General";
    const curr = projectMap.get(proj) || { total: 0, completed: 0, mins: 0 };
    curr.total += 1;
    if (t.status === "completed") {
      curr.completed += 1;
    } else {
      curr.mins += t.estimatedMinutes;
    }
    projectMap.set(proj, curr);
  });
  
  const projects = Array.from(projectMap.entries()).map(([name, stats]) => ({
    name,
    totalTasks: stats.total,
    completedTasks: stats.completed,
    pendingMinutes: stats.mins
  }));

  // Urgency aggregation
  const urgency = {
    criticalCount: pendingTasks.filter(t => t.urgency === "Critical").length,
    urgentCount: pendingTasks.filter(t => t.urgency === "Urgent").length,
    importantCount: pendingTasks.filter(t => t.urgency === "Important").length,
    normalCount: pendingTasks.filter(t => t.urgency === "Normal").length,
    relaxedCount: pendingTasks.filter(t => t.urgency === "Relaxed").length,
  };

  // Priority calculations
  let topPriorityTask: Task | null = null;
  let maxScore = -1;
  pendingTasks.forEach(t => {
    if (t.priorityScore !== null && t.priorityScore > maxScore) {
      maxScore = t.priorityScore;
      topPriorityTask = t;
    }
  });

  const priority = {
    topPriorityTaskId: topPriorityTask ? (topPriorityTask as Task).id : null,
    topPriorityTaskTitle: topPriorityTask ? (topPriorityTask as Task).title : null,
    highPriorityCount: pendingTasks.filter(t => t.priorityLabel === "High").length,
    mediumPriorityCount: pendingTasks.filter(t => t.priorityLabel === "Medium" || !t.priorityLabel).length,
    lowPriorityCount: pendingTasks.filter(t => t.priorityLabel === "Low").length
  };

  // Deadlines calculations
  const nowMs = now.getTime();
  const overdueCount = pendingTasks.filter(t => new Date(t.deadline).getTime() < nowMs).length;
  const dueTodayCount = pendingTasks.filter(t => {
    const d = new Date(t.deadline);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  
  const dueTomorrowCount = pendingTasks.filter(t => {
    const d = new Date(t.deadline);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
  }).length;

  const dueThisWeekCount = pendingTasks.filter(t => {
    const d = new Date(t.deadline);
    const diffDays = (d.getTime() - nowMs) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  const upcomingDeadlines = pendingTasks
    .filter(t => new Date(t.deadline).getTime() >= nowMs)
    .map(t => {
      const hoursLeft = Math.round((new Date(t.deadline).getTime() - nowMs) / (1000 * 60 * 60));
      return { taskId: t.id, title: t.title, hoursLeft };
    })
    .sort((a, b) => a.hoursLeft - b.hoursLeft)
    .slice(0, 3);

  // Calendar setup (simulated daily schedule)
  const calendar = {
    todayEvents: [
      { title: "Planning & Priority Alignment", startTime: "09:00 AM", endTime: "09:30 AM", type: "meeting" },
      { title: "Uninterrupted Deep Work Block 1", startTime: "10:00 AM", endTime: "12:00 PM", type: "focus" },
      { title: "Review & Quick Wins", startTime: "01:30 PM", endTime: "02:15 PM", type: "focus" },
      { title: "Consultation & Feedback", startTime: "03:30 PM", endTime: "04:00 PM", type: "meeting" }
    ]
  };

  // Dependency network mapping
  const blockedTaskIds: string[] = [];
  const blockingTaskIds: string[] = [];
  const bottleneckMap = new Map<string, { title: string; count: number }>();

  pendingTasks.forEach(t => {
    if (t.dependencies && t.dependencies.length > 0) {
      blockedTaskIds.push(t.id);
      t.dependencies.forEach(depId => {
        if (!blockingTaskIds.includes(depId)) {
          blockingTaskIds.push(depId);
        }
        const depTask = allTasks.find(x => x.id === depId);
        if (depTask) {
          const curr = bottleneckMap.get(depId) || { title: depTask.title, count: 0 };
          curr.count += 1;
          bottleneckMap.set(depId, curr);
        }
      });
    }
  });

  const bottlenecks = Array.from(bottleneckMap.entries()).map(([taskId, data]) => ({
    taskId,
    title: data.title,
    blockingCount: data.count
  })).sort((a, b) => b.blockingCount - a.blockingCount);

  // Simple dependency chain detector
  const dependencyChains: string[][] = [];
  pendingTasks.forEach(t => {
    if (t.dependencies && t.dependencies.length > 0) {
      t.dependencies.forEach(depId => {
        dependencyChains.push([depId, t.id]);
      });
    }
  });

  // Focus History Efficacy Score calculation
  const history = contextState.focusHistory;
  const totalSessions = history.length;
  const completed = history.filter(s => s.outcome === "completed");
  const abandoned = history.filter(s => s.outcome === "abandoned" || s.outcome === "cancelled");
  const completedCount = completed.length;
  const abandonedCount = abandoned.length;

  const completionRate = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 100;
  const abandonedRate = totalSessions > 0 ? Math.round((abandonedCount / totalSessions) * 100) : 0;
  
  let totalMins = 0;
  completed.forEach(s => {
    totalMins += s.actualDurationMinutes || 0;
  });
  const averageSessionMinutes = completedCount > 0 ? Math.round(totalMins / completedCount) : 0;

  // Calculate overall efficacy index
  let efficacyScore = 75; // Default score
  if (totalSessions > 0) {
    efficacyScore = Math.round(
      (completionRate * 0.6) + 
      (Math.min(100, (averageSessionMinutes / 25) * 100) * 0.3) + 
      (10 * 1.0)
    );
    efficacyScore = Math.max(10, Math.min(100, efficacyScore));
  }

  let efficacyLevel: "Excellent" | "High" | "Moderate" | "Needs Improvement" = "Moderate";
  if (efficacyScore >= 85) efficacyLevel = "Excellent";
  else if (efficacyScore >= 70) efficacyLevel = "High";
  else if (efficacyScore >= 45) efficacyLevel = "Moderate";
  else efficacyLevel = "Needs Improvement";

  const focusEfficacy = {
    completionRate,
    abandonedRate,
    averageSessionMinutes,
    efficacyScore,
    efficacyLevel
  };

  // Available productive time today calculation
  const workEndHour = 18; // 6:00 PM
  const currentHour = now.getHours();
  let availableMinutesToday = 0;
  if (currentHour < workEndHour) {
    availableMinutesToday = (workEndHour - currentHour) * 60 - now.getMinutes();
  } else {
    availableMinutesToday = 60; // default window if outside preferred hours
  }

  const totalPendingTaskMinutes = pendingTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const isOverloaded = totalPendingTaskMinutes > availableMinutesToday;

  // Recommended action depending on energy level
  let energyRec = "Ideal time for critical planning, quick wins, and administration.";
  if (contextState.energyLevel === "High") {
    energyRec = "Focus is maximized. Directly attack High Difficulty and Critical Risk bottleneck tasks.";
  } else if (contextState.energyLevel === "Medium") {
    energyRec = "Steady endurance. Perfect for reviewing core algorithms, documentation, or moderate coding.";
  }

  // Active Session Mapping
  const activeSess = contextState.currentWorkingSession;
  let mappedActiveSess = {
    isActive: false,
    taskId: null as string | null,
    taskTitle: null as string | null,
    startedAt: null as string | null,
    plannedMinutes: null as number | null,
    elapsedMinutes: null as number | null
  };

  if (activeSess) {
    const started = new Date(activeSess.startedAt);
    const elapsed = Math.round((now.getTime() - started.getTime()) / (1000 * 60));
    const targetT = allTasks.find(x => x.id === activeSess.taskId);
    mappedActiveSess = {
      isActive: true,
      taskId: activeSess.taskId,
      taskTitle: targetT ? targetT.title : "General Focus Session",
      startedAt: activeSess.startedAt,
      plannedMinutes: activeSess.plannedDurationMinutes,
      elapsedMinutes: Math.max(0, elapsed)
    };
  }

  const baseContext: AIContext = {
    currentTime,
    currentDate,
    tasks: {
      pending: mappedPending,
      completed: mappedCompleted
    },
    projects,
    deadlines: {
      overdueCount,
      dueTodayCount,
      dueTomorrowCount,
      dueThisWeekCount,
      upcomingDeadlines
    },
    calendar,
    urgency,
    priority,
    dependencies: {
      blockedTaskIds,
      blockingTaskIds,
      bottlenecks,
      dependencyChains
    },
    availableTime: {
      availableMinutesToday,
      totalPendingTaskMinutes,
      isOverloaded
    },
    focusHistory: history,
    focusEfficacy,
    recentAIRecommendations: aiMemoryService.getRecommendations(),
    aiMemory: aiMemoryService.getMemory(),
    userPreferences: contextState.userPreferences,
    energyLevel: {
      current: contextState.energyLevel,
      recommendation: energyRec
    },
    currentWorkingSession: mappedActiveSess
  };

  if (customOverrides) {
    return { ...baseContext, ...customOverrides };
  }
  return baseContext;
}

// Convert structured context into a crisp system string for the LLM
export function getAIContextPromptString(ctx: AIContext): string {
  return `
=========================================
CURRENT SYSTEM OPERATING CONTEXT (LIVESAVER OS)
=========================================
Time Context:
- Current Time: ${ctx.currentTime}
- Current Date: ${ctx.currentDate}

Productivity Thresholds:
- Available Time Remaining: ${ctx.availableTime.availableMinutesToday} mins
- Total Backlog Workload: ${ctx.availableTime.totalPendingTaskMinutes} mins
- Workload Load Alert: ${ctx.availableTime.isOverloaded ? "OVERLOADED (backlog exceeds remaining window)" : "NOMINAL"}

User Energy and Focus Profiles:
- Current Energy State: ${ctx.energyLevel.current} (Recommendation: ${ctx.energyLevel.recommendation})
- Focus Efficacy Index: ${ctx.focusEfficacy.efficacyScore}/100 (${ctx.focusEfficacy.efficacyLevel})
- Focus Session Completion Success Rate: ${ctx.focusEfficacy.completionRate}% (Avg duration: ${ctx.focusEfficacy.averageSessionMinutes} mins)

Ongoing Workspace:
- Active Session Status: ${ctx.currentWorkingSession.isActive ? `ACTIVE focusing on "${ctx.currentWorkingSession.taskTitle}"` : "NONE"}

Tasks & Projects Distribution:
- Total Pending: ${ctx.tasks.pending.length} tasks | Completed: ${ctx.tasks.completed.length} tasks
- Projects: ${ctx.projects.map(p => `${p.name} (${p.completedTasks}/${p.totalTasks} completed)`).join(", ")}
- Urgency Backlog: ${ctx.urgency.criticalCount} Critical, ${ctx.urgency.urgentCount} Urgent, ${ctx.urgency.importantCount} Important
- Deadlines Timeline: Today (${ctx.deadlines.dueTodayCount}), Tomorrow (${ctx.deadlines.dueTomorrowCount}), Overdue (${ctx.deadlines.overdueCount})

Task Dependency Network:
- Active Bottlenecks (blocking others): ${ctx.dependencies.bottlenecks.map(b => `"${b.title}" blocks ${b.blockingCount} tasks`).join(", ") || "None"}
- Blocked Tasks: ${ctx.dependencies.blockedTaskIds.length} items

Recent Coaching Logs & Observations (AI Memory):
${ctx.aiMemory.map(m => `- ${m}`).join("\n")}

Recent AI Recommendations:
${ctx.recentAIRecommendations.map(r => `- ${r}`).join("\n")}

User Setup Preferences:
- Preferred Interval: ${ctx.userPreferences.preferredFocusDuration} mins
- Daily Commitment Target: ${ctx.userPreferences.dailyTargetMinutes} mins
- Active Tone: ${ctx.userPreferences.coachingTone}
=========================================
`;
}
