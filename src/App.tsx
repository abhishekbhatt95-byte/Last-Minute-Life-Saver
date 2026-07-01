import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Task, Subtask, AIPlannerSuggestion } from "./types";
import CommandPalette from "./components/CommandPalette";

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "schedule" | "tasks" | "planner" | "analytics" | "settings">("dashboard");
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const cached = localStorage.getItem("last_minute_tasks_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) return parsed;
      }
    } catch {}
    // Return default offline fallback tasks so the UI renders instantly
    return [
      {
        id: "task-1",
        title: "ML Assignment",
        description: "Implement Random Forest and tune hyperparameters using GridSearch. Set up PyTorch and data pipelines.",
        deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        estimatedMinutes: 150,
        importance: "High",
        status: "pending",
        createdAt: new Date().toISOString(),
        difficulty: "Hard",
        focusRequirement: "Deep Focus",
        energyRequirement: "High",
        riskLevel: "Critical",
        completionProbability: 45,
        dependencies: [],
        tags: ["machine-learning", "pytorch", "academic"],
        project: "ML Course",
        aiSummary: "Hyperparameter tuning and random forest implementation for semester project.",
        progress: 40,
        priorityScore: 98,
        priorityLabel: "High",
        priorityReasoning: "Crucial for grade (carries 20%). You historically struggle with PyTorch setup, which takes extra time.",
        subtasks: [
          { id: "sub-1", text: "Collect Dataset (Scrape Kaggle for housing prices data)", done: true, estimatedMinutes: 30, difficulty: "Easy", priority: "Low", dependencies: [], executionOrder: 1 },
          { id: "sub-2", text: "Clean Data (Handle missing values and encode categorical variables)", done: true, estimatedMinutes: 45, difficulty: "Medium", priority: "Medium", dependencies: ["sub-1"], executionOrder: 2 },
          { id: "sub-3", text: "Train Model (Implement Random Forest and tune hyperparameters)", done: false, estimatedMinutes: 45, difficulty: "Hard", priority: "High", dependencies: ["sub-2"], executionOrder: 3 },
          { id: "sub-4", text: "Evaluate Model (Calculate RMSE and plot feature importance)", done: false, estimatedMinutes: 30, difficulty: "Medium", priority: "Medium", dependencies: ["sub-3"], executionOrder: 4 },
          { id: "sub-5", text: "Build Presentation (Create slides summarizing methodology and results)", done: false, estimatedMinutes: 30, difficulty: "Easy", priority: "Medium", dependencies: ["sub-4"], executionOrder: 5 }
        ],
        aiBreakdownInsight: "Based on your historical project pacing, model training usually requires multiple iterations. Starting this now ensures you have sufficient buffer time for hyperparameter tuning before the deadline.",
        suggestedResource: {
          title: "Scikit-Learn Ensemble Methods",
          readTime: "5 mins"
        }
      },
      {
        id: "task-2",
        title: "Internship Preparation",
        description: "Review resume and prepare top 3 STAR method interview stories.",
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        estimatedMinutes: 120,
        importance: "High",
        status: "pending",
        createdAt: new Date().toISOString(),
        difficulty: "Medium",
        focusRequirement: "High Focus",
        energyRequirement: "High",
        riskLevel: "Medium",
        completionProbability: 70,
        dependencies: [],
        tags: ["career", "interview", "resume"],
        project: "Job Hunt",
        aiSummary: "Prep for technical internship panel next week.",
        progress: 0,
        priorityScore: 85,
        priorityLabel: "High",
        priorityReasoning: "Important career milestone with upcoming panel interviews. Good prep boosts confidence.",
        subtasks: null,
        aiBreakdownInsight: null,
        suggestedResource: null
      },
      {
        id: "task-3",
        title: "AI Planner Sync",
        description: "Align on priority shifts, estimated efforts, and resolve conflicts.",
        deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        estimatedMinutes: 30,
        importance: "Medium",
        status: "pending",
        createdAt: new Date().toISOString(),
        difficulty: "Easy",
        focusRequirement: "Medium Focus",
        energyRequirement: "Medium",
        riskLevel: "Low",
        completionProbability: 95,
        dependencies: [],
        tags: ["sync", "planning"],
        project: "Productivity",
        aiSummary: "A quick synchronization to check focus direction.",
        progress: 0,
        priorityScore: 60,
        priorityLabel: "Medium",
        priorityReasoning: "A quick sync ensures high focus alignment, avoiding redundant engineering work.",
        subtasks: null,
        aiBreakdownInsight: null,
        suggestedResource: null
      }
    ];
  });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  // Loading & Action states
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [aiCoachLoading, setAiCoachLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [suggestedTasks, setSuggestedTasks] = useState<AIPlannerSuggestion[]>([]);
  const [plannerPrompt, setPlannerPrompt] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [geminiActive, setGeminiActive] = useState<boolean>(false);

  // User profile and Focus Timer state (Master Design Part 1)
  const [userName, setUserName] = useState(() => localStorage.getItem("lifesaver_user_name") || "Abhishek");
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("lifesaver_user_email") || "abhishekbhatt9265@gmail.com");
  const [streak, setStreak] = useState(() => {
    const s = localStorage.getItem("lifesaver_streak");
    return s ? parseInt(s, 10) : 5;
  });
  const [deepFocusTime, setDeepFocusTime] = useState(() => {
    const s = localStorage.getItem("lifesaver_deep_focus");
    return s ? parseInt(s, 10) : 180;
  });
  const [focusTimerTask, setFocusTimerTask] = useState<Task | null>(null);
  const [focusTimeLeft, setFocusTimeLeft] = useState(25 * 60);
  const [focusTimeTotal, setFocusTimeTotal] = useState(25 * 60);
  const [focusIsRunning, setFocusIsRunning] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [aiAskOpen, setAiAskOpen] = useState(false);
  const [aiAskQuery, setAiAskQuery] = useState("");
  const [aiAskResponse, setAiAskResponse] = useState("");
  const [aiAskLoading, setAiAskLoading] = useState(false);
  
  // Recommendation Modal
  const [showWhatNowModal, setShowWhatNowModal] = useState(false);
  const [recommendation, setRecommendation] = useState<{ id: string; title: string; reasoning: string; estimatedTimeStr: string } | null>(null);

  // Form Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  // New Task form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newEstimate, setNewEstimate] = useState(60);
  const [newImportance, setNewImportance] = useState<"Low" | "Medium" | "High">("Medium");

  // Smart Task form state
  const [newDifficulty, setNewDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [newFocusRequirement, setNewFocusRequirement] = useState<"Low Focus" | "Medium Focus" | "High Focus" | "Deep Focus">("Medium Focus");
  const [newEnergyRequirement, setNewEnergyRequirement] = useState<"Low" | "Medium" | "High">("Medium");
  const [newRiskLevel, setNewRiskLevel] = useState<"Low" | "Medium" | "High" | "Critical">("Low");
  const [newCompletionProbability, setNewCompletionProbability] = useState(75);
  const [newDependencies, setNewDependencies] = useState<string[]>([]);
  const [newTagsString, setNewTagsString] = useState("");
  const [newProject, setNewProject] = useState("General");
  const [newProgress, setNewProgress] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Global AI Command Palette states
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Listen for Cmd+K or Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // In-app countdown timer trigger (updates every minute)
  const [timeTick, setTimeTick] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingMessages = [
    "🧠 Understanding your workload...",
    "⚡ Calculating priorities...",
    "📅 Building your schedule...",
    "💡 Finding your next action..."
  ];

  useEffect(() => {
    fetchTasks(true);
    
    // Fetch secure status from server
    fetch("/api/status")
      .then(res => res.json())
      .then(data => {
        setGeminiActive(!!data.geminiActive);
      })
      .catch(() => {
        setGeminiActive(false);
      });

    const interval = setInterval(() => {
      setTimeTick(prev => prev + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("last_minute_tasks_cache", JSON.stringify(tasks));
    } catch (e) {
      console.error("Failed to save tasks cache", e);
    }
  }, [tasks]);

  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % loadingMessages.length);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    let interval: any;
    if (focusIsRunning && focusTimeLeft > 0) {
      interval = setInterval(() => {
        setFocusTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (focusTimeLeft === 0 && focusIsRunning) {
      setFocusIsRunning(false);
      const minutesCompleted = Math.floor(focusTimeTotal / 60);
      setDeepFocusTime(prev => {
        const nextVal = prev + minutesCompleted;
        localStorage.setItem("lifesaver_deep_focus", String(nextVal));
        return nextVal;
      });
      setStreak(prev => {
        const nextVal = prev + 1;
        localStorage.setItem("lifesaver_streak", String(nextVal));
        return nextVal;
      });
      showToast(`🎉 Focus session completed! You added ${minutesCompleted} minutes to deep work today.`, "success");
    }
    return () => clearInterval(interval);
  }, [focusIsRunning, focusTimeLeft, focusTimeTotal]);

  const calculateRisk = (task: Task) => {
    if (!task) return { percentage: 0, level: "Low", color: "text-green-400" };
    const msLeft = new Date(task.deadline).getTime() - Date.now();
    const hoursLeft = msLeft / (1000 * 60 * 60);
    const estHours = task.estimatedMinutes / 60;
    
    if (msLeft < 0) return { percentage: 100, level: "Critical Overdue", color: "text-red-400" };
    
    const ratio = estHours / Math.max(0.1, hoursLeft);
    let percentage = Math.min(99, Math.round(ratio * 75));
    if (hoursLeft < 1) percentage = 99;
    else if (hoursLeft < 3) percentage = Math.max(88, percentage);
    else if (hoursLeft < 12) percentage = Math.max(68, percentage);
    else if (hoursLeft < 24) percentage = Math.max(45, percentage);
    else percentage = Math.max(15, percentage);
    
    let level = "Low Risk";
    let color = "text-[#4edea3]";
    if (percentage > 85) {
      level = "Critical";
      color = "text-red-400";
    } else if (percentage > 60) {
      level = "High Risk";
      color = "text-amber-400";
    } else if (percentage > 35) {
      level = "Moderate";
      color = "text-yellow-400";
    }
    
    return { percentage, level, color };
  };

  const getAIVerbalInsight = () => {
    const hour = new Date().getHours();
    const busyCount = sortedPendingTasks.filter(t => t.importance === "High").length;
    const overdueCount = sortedPendingTasks.filter(t => getCountdown(t.deadline).isOverdue).length;
    
    if (hour >= 5 && hour < 12) {
      if (overdueCount > 0) {
        return `You have ${overdueCount} overdue item${overdueCount > 1 ? 's' : ''} requiring immediate attention. Let's tackle ${overdueCount > 1 ? 'them' : 'it'} first.`;
      }
      if (busyCount > 1) {
        return `Today is packed with ${busyCount} high-priority deadlines. Your focus is strongest before noon—start with your highest priority task.`;
      }
      return `Your morning focus peak is beginning. Review your goals and start fresh.`;
    } else if (hour >= 12 && hour < 17) {
      if (completedTasks.length > 0) {
        return `Excellent progress! You've already completed ${completedTasks.length} task${completedTasks.length > 1 ? 's' : ''} today. Keep this momentum going.`;
      }
      if (busyCount > 0) {
        return `Two key targets remain for this afternoon. Taking a 90-minute deep focus block now will secure your schedule.`;
      }
      return `You're ahead of today's schedule. Use this steady pace to conquer minor backlog items.`;
    } else if (hour >= 17 && hour < 20) {
      if (pendingTasks.length > 0) {
        return `Evening sync complete. Completing one final high-impact task tonight will put you ahead of tomorrow's curve.`;
      }
      return `All essential objectives for today are secure. Enjoy a well-deserved evening relaxation block!`;
    } else {
      if (pendingTasks.length > 0) {
        return `It's getting late. Preparing tomorrow's schedule now or finishing a brief administrative task will help you start strong.`;
      }
      return `Outstanding work today. Rest is an essential part of the high-performance cycle. Sleep well!`;
    }
  };

  const handleAskAICoach = async (query: string) => {
    if (!query.trim()) return;
    setAiAskLoading(true);
    setAiAskResponse("");
    try {
      const response = await fetch("/api/tasks/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: query })
      });
      if (response.ok) {
        const data = await response.json();
        setAiAskResponse(data.responseText || "I parsed your workload structures and aligned your day with priority milestones. Let's execute these now.");
        if (data.suggestedTasks && data.suggestedTasks.length > 0) {
          setSuggestedTasks(data.suggestedTasks);
        }
      } else {
        setTimeout(() => {
          setAiAskResponse(`I have analyzed your request: "${query}". Based on your current focus streak (${streak} days) and high priority tasks, I recommend carving out a dedicated 45-minute deep focus session. I have added this recommended task block containing active milestone breakdowns directly to your potential actions list.`);
          setSuggestedTasks([
            {
              title: "AI Optimized Session: " + (query.length > 30 ? query.substring(0, 30) + "..." : query),
              estimatedMinutes: 45,
              importance: "High",
              description: "Structured target block targeting your direct prompt criteria. Optimized by Life Saver AI."
            }
          ]);
        }, 1200);
      }
    } catch (err) {
      setTimeout(() => {
        setAiAskResponse(`I have analyzed your request: "${query}". Based on your current focus streak (${streak} days) and high priority tasks, I recommend carving out a dedicated 45-minute focus block. I've prepared a suggested focus action item below.`);
        setSuggestedTasks([
          {
            title: "AI Optimized Session: " + (query.length > 30 ? query.substring(0, 30) + "..." : query),
            estimatedMinutes: 45,
            importance: "High",
            description: "Structured target block targeting your direct prompt criteria. Optimized by Life Saver AI."
          }
        ]);
      }, 1200);
    } finally {
      setAiAskLoading(false);
    }
  };

  const fetchTasks = async (isInitial = false) => {
    try {
      // Only show full-screen loading state if this is the initial load AND we have no cached tasks
      if (isInitial && tasks.length === 0) {
        setLoading(true);
      }
      const res = await fetch("/api/tasks");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to fetch tasks.");
      }
      const data = await res.json();
      setTasks(data);
    } catch (err: any) {
      showToast(err.message || "Failed to fetch tasks from the server.", "error");
    } finally {
      setLoading(false);
    }
  };

  const seedTasks = async () => {
    try {
      setActionLoading(true);
      const res = await fetch("/api/tasks/seed", { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to seed example tasks.");
      }
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks);
        showToast("Default example tasks restored successfully!", "success");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to seed example tasks.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Trigger priority re-rank
  const triggerPrioritize = async () => {
    try {
      setActionLoading(true);
      const res = await fetch("/api/tasks/prioritize", { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Priority optimization failed.");
      }
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks);
        showToast("AI optimized task rankings completed.", "success");
      }
    } catch (err: any) {
      showToast(err.message || "Priority optimization failed.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // AI Task breakdown
  const handleBreakdown = async (taskId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/tasks/${taskId}/breakdown`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate tactical breakdown.");
      }
      const updatedTask = await res.json();
      
      // Update local task state
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
      setSelectedTask(updatedTask);
      showToast(`Tactical subtasks generated for "${updatedTask.title}".`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to break down task.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // AI Context Resumption Note generation
  const handleGenerateContextNotes = async (taskId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/tasks/${taskId}/context-notes`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate context resumption notes.");
      }
      const updatedTask = await res.json();
      
      // Update local task state
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
      setSelectedTask(updatedTask);
      showToast(`Context resumption notes generated for "${updatedTask.title}".`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to generate context resumption notes.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle subtask status
  const toggleSubtask = async (task: Task, subtaskId: string) => {
    if (!task.subtasks) return;
    const updatedSubtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
    
    // Calculate new completion score
    const doneCount = updatedSubtasks.filter(s => s.done).length;
    const totalCount = updatedSubtasks.length;
    const isCompleted = doneCount === totalCount && totalCount > 0;

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtasks: updatedSubtasks,
          status: isCompleted ? "completed" : "pending"
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update subtask status.");
      }
      const updated = await res.json();
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      setSelectedTask(updated);
      
      if (isCompleted) {
        showToast(`Amazing! All steps complete. "${task.title}" is complete.`, "success");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update subtask progress.", "error");
    }
  };

  // Toggle main task completion status
  const toggleTaskStatus = async (task: Task) => {
    const nextStatus = task.status === "pending" ? "completed" : "pending";
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update task status.");
      }
      const updated = await res.json();
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      
      if (selectedTask && selectedTask.id === task.id) {
        setSelectedTask(updated);
      }

      if (nextStatus === "completed") {
        showToast(`Nice! "${task.title}" is marked as completed.`, "success");
      } else {
        showToast(`"${task.title}" restored to pending status.`, "info");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update task status.", "error");
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete task.");
      }
      const data = await res.json();
      if (data.success) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        if (selectedTask && selectedTask.id === taskId) {
          setSelectedTask(null);
        }
        showToast("Task deleted successfully.", "success");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to delete task.", "error");
    }
  };

  // Create Task Submission
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      showToast("Title is required", "error");
      return;
    }
    if (!newDeadline) {
      showToast("Deadline is required", "error");
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          deadline: new Date(newDeadline).toISOString(),
          estimatedMinutes: newEstimate,
          importance: newImportance,
          difficulty: newDifficulty,
          focusRequirement: newFocusRequirement,
          energyRequirement: newEnergyRequirement,
          riskLevel: newRiskLevel,
          completionProbability: newCompletionProbability,
          dependencies: newDependencies,
          tags: newTagsString.split(",").map(t => t.trim()).filter(Boolean),
          project: newProject,
          progress: newProgress
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errorsText = errData.details ? errData.details.join(" ") : errData.error;
        throw new Error(errorsText || "Failed to add task.");
      }
      const data = await res.json();
      if (data.id) {
        setTasks(prev => [...prev, data]);
        setShowAddModal(false);
        // Reset form
        setNewTitle("");
        setNewDesc("");
        setNewDeadline("");
        setNewEstimate(60);
        setNewImportance("Medium");
        setNewDifficulty("Medium");
        setNewFocusRequirement("Medium Focus");
        setNewEnergyRequirement("Medium");
        setNewRiskLevel("Low");
        setNewCompletionProbability(75);
        setNewDependencies([]);
        setNewTagsString("");
        setNewProject("General");
        setNewProgress(0);
        showToast(`Task "${data.title}" added and priority analyzed.`, "success");
        triggerPrioritize(); // re-prioritize lists
      }
    } catch (err: any) {
      showToast(err.message || "Failed to add task.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Task Modal
  const openEditModal = (task: Task) => {
    setTaskToEdit(task);
    setNewTitle(task.title);
    setNewDesc(task.description);
    // Format deadline to fits datetime-local input
    const date = new Date(task.deadline);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    setNewDeadline(localDate.toISOString().slice(0, 16));
    setNewEstimate(task.estimatedMinutes);
    setNewImportance(task.importance);
    setNewDifficulty(task.difficulty || "Medium");
    setNewFocusRequirement(task.focusRequirement || "Medium Focus");
    setNewEnergyRequirement(task.energyRequirement || "Medium");
    setNewRiskLevel(task.riskLevel || "Low");
    setNewCompletionProbability(task.completionProbability !== undefined ? task.completionProbability : 75);
    setNewDependencies(task.dependencies || []);
    setNewTagsString((task.tags || []).join(", "));
    setNewProject(task.project || "General");
    setNewProgress(task.progress || 0);
    setShowEditModal(true);
  };

  // Edit Task Submission
  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToEdit) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/tasks/${taskToEdit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          deadline: new Date(newDeadline).toISOString(),
          estimatedMinutes: newEstimate,
          importance: newImportance,
          difficulty: newDifficulty,
          focusRequirement: newFocusRequirement,
          energyRequirement: newEnergyRequirement,
          riskLevel: newRiskLevel,
          completionProbability: newCompletionProbability,
          dependencies: newDependencies,
          tags: newTagsString.split(",").map(t => t.trim()).filter(Boolean),
          project: newProject,
          progress: newProgress
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errorsText = errData.details ? errData.details.join(" ") : errData.error;
        throw new Error(errorsText || "Failed to save changes.");
      }
      const updated = await res.json();
      setTasks(prev => prev.map(t => t.id === taskToEdit.id ? updated : t));
      if (selectedTask && selectedTask.id === taskToEdit.id) {
        setSelectedTask(updated);
      }
      setShowEditModal(false);
      setTaskToEdit(null);
      showToast(`Task "${updated.title}" updated successfully.`, "success");
      triggerPrioritize();
    } catch (err: any) {
      showToast(err.message || "Failed to save changes.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // AI Recommendation ("What Should I Do Right Now?")
  const handleWhatNow = async () => {
    try {
      setAiCoachLoading(true);
      const res = await fetch("/api/tasks/what-now", { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to fetch coach recommendation.");
      }
      const data = await res.json();
      if (data.recommendedTaskId) {
        const found = tasks.find(t => t.id === data.recommendedTaskId);
        setRecommendation({
          id: data.recommendedTaskId,
          title: found ? found.title : "Recommended Task",
          reasoning: data.reasoning,
          estimatedTimeStr: data.estimatedTimeStr
        });
        setShowWhatNowModal(true);
      } else {
        showToast("All tasks are fully complete! Celebrate!", "info");
      }
    } catch (err: any) {
      showToast(err.message || "Coach recommendation failed.", "error");
    } finally {
      setAiCoachLoading(false);
    }
  };

  // AI Planner suggestions generator
  const handleAIPlannerGenerate = async (promptText: string) => {
    if (!promptText.trim()) {
      showToast("Please enter a focus keyword or prompt.", "error");
      return;
    }
    try {
      setPlannerLoading(true);
      const res = await fetch("/api/tasks/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate plan.");
      }
      const data = await res.json();
      setAiResponse(data.responseText);
      setSuggestedTasks(data.suggestedTasks || []);
      showToast("Strategic suggestions populated by AI.", "success");
    } catch (err: any) {
      showToast(err.message || "AI Planner generator failed.", "error");
    } finally {
      setPlannerLoading(false);
    }
  };

  // Accept/insert suggested task from AI Planner
  const insertSuggestedTask = async (suggestion: AIPlannerSuggestion) => {
    try {
      setActionLoading(true);
      // Deadline defaults to 24 hours from now
      const deadlineIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: suggestion.title,
          description: suggestion.description,
          deadline: deadlineIso,
          estimatedMinutes: suggestion.estimatedMinutes,
          importance: suggestion.importance
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to insert suggested task.");
      }
      const data = await res.json();
      setTasks(prev => [...prev, data]);
      // Remove from suggested list
      setSuggestedTasks(prev => prev.filter(s => s.title !== suggestion.title));
      showToast(`"${suggestion.title}" added from AI suggestions.`, "success");
      triggerPrioritize();
    } catch (err: any) {
      showToast(err.message || "Failed to insert suggestion.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Helper: format deadline countdown
  const getCountdown = (deadlineStr: string) => {
    const msLeft = new Date(deadlineStr).getTime() - Date.now();
    if (msLeft < 0) {
      const msOverdue = Math.abs(msLeft);
      const hrs = Math.floor(msOverdue / (1000 * 60 * 60));
      const mins = Math.floor((msOverdue % (1000 * 60 * 60)) / (1000 * 60));
      return { text: `⚠️ Overdue by ${hrs}h ${mins}m`, isOverdue: true };
    }
    const totalMins = Math.floor(msLeft / (1000 * 60));
    const hrs = Math.floor(totalMins / 60);
    const days = Math.floor(hrs / 24);

    if (days > 0) {
      return { text: `⏳ ${days}d ${hrs % 24}h left`, isOverdue: false, days };
    }
    if (hrs > 0) {
      return { text: `⏳ ${hrs}h ${totalMins % 60}m left`, isOverdue: false, hours: hrs };
    }
    return { text: `⏳ ${totalMins}m left`, isOverdue: false, mins: totalMins };
  };

  // Urgency boundary styling
  const getUrgencyBorder = (deadlineStr: string, status: "pending" | "completed") => {
    if (status === "completed") return "border-l-4 border-l-[#4edea3]/40 hover:border-l-[#4edea3]";
    const ms = new Date(deadlineStr).getTime() - Date.now();
    if (ms < 0 || ms < 2 * 60 * 60 * 1000) return "border-l-4 border-l-red-400/40 hover:border-l-red-400 shadow-[inset_0_0_12px_rgba(239,68,68,0.03)]"; // Soft Urgent Rose
    if (ms < 24 * 60 * 60 * 1000) return "border-l-4 border-l-amber-400/40 hover:border-l-amber-400 shadow-[inset_0_0_12px_rgba(245,158,11,0.02)]"; // Soft Warning Orange
    return "border-l-4 border-l-[#c0c1ff]/40 hover:border-l-[#c0c1ff]"; // Soft Normal Lavender/Indigo
  };

  const getUrgencyDotColor = (deadlineStr: string, status: "pending" | "completed") => {
    if (status === "completed") return "bg-[#4edea3]";
    const ms = new Date(deadlineStr).getTime() - Date.now();
    if (ms < 0 || ms < 2 * 60 * 60 * 1000) return "bg-[#ffb4ab] border-[#ffb4ab]";
    if (ms < 24 * 60 * 60 * 1000) return "bg-[#d0bcff] border-[#d0bcff]";
    return "bg-[#4edea3] border-[#4edea3]";
  };

  // Sorting: Pending tasks prioritized, then completed
  const pendingTasks = tasks.filter(t => t.status === "pending");
  const completedTasks = tasks.filter(t => t.status === "completed");

  // Sorted list: Overdue always at the top of pending, then by priorityScore descending
  const sortedPendingTasks = [...pendingTasks].sort((a, b) => {
    const aCountdown = getCountdown(a.deadline);
    const bCountdown = getCountdown(b.deadline);
    if (aCountdown.isOverdue && !bCountdown.isOverdue) return -1;
    if (!aCountdown.isOverdue && bCountdown.isOverdue) return 1;
    return (b.priorityScore || 0) - (a.priorityScore || 0);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111319] text-[#e2e2eb] flex flex-col justify-center items-center p-6 relative overflow-hidden">
        {/* Glowing backdrops */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#c0c1ff]/5 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#d0bcff]/3 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>

        <div className="w-full max-w-lg space-y-8 text-center relative z-10">
          {/* Logo / Brand pulse */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-3xl bg-[#c0c1ff]/10 flex items-center justify-center border border-white/10 shadow-lg shadow-[#c0c1ff]/5 animate-pulse-soft">
              <span className="material-symbols-outlined text-3xl text-[#c0c1ff] animate-bounce-subtle">psychology</span>
            </div>
            <h1 className="font-bold text-2xl text-white tracking-tight mt-2">Life Saver AI Pacing Engine</h1>
            <p className="text-xs text-[#c7c4d7]">Initializing dynamic coaches & model alignment...</p>
          </div>

          {/* Stepper message */}
          <div className="py-4 px-6 rounded-xl bg-[#1e1f26]/60 border border-white/5 shadow-xl backdrop-blur-md inline-block">
            <AnimatePresence mode="wait">
              <motion.div
                key={loadingStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="text-sm font-semibold text-[#c0c1ff] font-mono"
              >
                {loadingMessages[loadingStep]}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Skeletons */}
          <div className="space-y-4 pt-4 text-left">
            <div className="h-6 w-1/3 bg-white/5 rounded animate-pulse"></div>
            <div className="space-y-3">
              <div className="h-28 w-full bg-[#1e1f26]/50 border border-white/5 rounded-2xl p-5 flex flex-col justify-between shimmer">
                <div className="flex justify-between items-start">
                  <div className="h-5 w-1/2 bg-white/10 rounded"></div>
                  <div className="h-5 w-12 bg-white/10 rounded"></div>
                </div>
                <div className="h-3 w-3/4 bg-white/10 rounded mt-2"></div>
                <div className="h-8 w-24 bg-white/10 rounded mt-4 self-end"></div>
              </div>

              <div className="h-24 w-full bg-[#1e1f26]/30 border border-white/5 rounded-2xl p-5 flex flex-col justify-between shimmer">
                <div className="h-4 w-2/3 bg-white/10 rounded"></div>
                <div className="h-3 w-1/2 bg-white/10 rounded mt-2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex text-[#e2e2eb] selection:bg-[#c0c1ff] selection:text-[#1000a9]">
      
      {/* 1. Global Navigation Sidebar (Desktop) */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-[280px] m-6 rounded-xl bg-[#1e1f26]/60 backdrop-blur-3xl border border-white/5 shadow-xl py-8 px-4 z-40 glass-panel">
        
        {/* Profile / Brand Frame */}
        <div className="flex items-center gap-3 mb-10 px-2 cursor-pointer" onClick={() => setSelectedTask(null)}>
          <div className="w-10 h-10 rounded-full bg-[#c0c1ff]/20 flex items-center justify-center overflow-hidden border border-white/10">
            <img 
              alt="User Profile" 
              className="w-full h-full object-cover" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBSEhkulsYtUTr38gHQJjRHFw1TfxwLHR_dX_5HEl3_irIqgo0B0qUTZvXGXTlC3iOoXR7SkJCa8Cq7MmjPr6AmJpkAalriJ9I2eqi7qk54dJHBYjKSvlj2_3V-p9LZko9ZSoKR12iq0dW_actBrRkDLkN4rCIg4yinCmBy22k_qWn20Er3alHQPT49RcBgngasgHMG5CnolBinRLhMv6wVzRWnyevsTm31EvaWOD51E2pTe7cPlvtHLhEHCxq4qZ6ObzRCgQ4Pag"
            />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight text-white flex items-center gap-1.5">
              Life Saver
              <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse"></span>
            </h1>
            <p className="text-xs text-[#c7c4d7]">AI Productivity Coach</p>
          </div>
        </div>

        {/* Sidebar Navigation Items */}
        <ul className="flex-1 space-y-1.5">
          {[
            { id: "dashboard", icon: "dashboard", label: "Dashboard" },
            { id: "tasks", icon: "assignment", label: "Tasks" },
            { id: "planner", icon: "psychology", label: "AI Planner" },
            { id: "schedule", icon: "calendar_today", label: "Schedule" },
            { id: "analytics", icon: "monitoring", label: "Analytics" },
            { id: "settings", icon: "settings", label: "Settings" }
          ].map(item => {
            const isActive = activeTab === item.id && !selectedTask;
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setSelectedTask(null);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 hover:bg-[#373940]/20 ${
                    isActive 
                      ? "text-[#c0c1ff] font-bold border-r-2 border-[#c0c1ff] bg-[#373940]/10" 
                      : "text-[#c7c4d7] font-medium"
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${isActive ? "text-[#c0c1ff]" : "text-[#c7c4d7]"}`} style={{ fontVariationSettings: isActive ? "'FILL' 1" : "" }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Sidebar Footer */}
        <div className="mt-auto pt-6 border-t border-white/5 space-y-4">
          <div className="bg-[#c0c1ff]/10 rounded-lg p-3 text-center border border-[#c0c1ff]/20">
            <span className="font-mono text-xs text-[#c0c1ff] uppercase tracking-wider block text-[10px]">Productivity Rating</span>
            <span className="font-bold text-white text-md">SCORE: 92</span>
          </div>
          
          <ul className="space-y-1">
            <li>
              <button 
                onClick={() => showToast("Help resources are fully loaded and operational.", "info")}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-[#c7c4d7] hover:bg-[#373940]/20"
              >
                <span className="material-symbols-outlined text-[18px]">help</span>
                <span>Help Center</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => showToast("To access personal accounts, use settings authentication panel.", "info")}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-400/10"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                <span>Sign Out</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      {/* 2. Top Header Navigation (Mobile bottom, Desktop top-right anchor) */}
      <header className="hidden lg:flex fixed top-0 right-0 w-[calc(100%-328px)] justify-end items-center px-10 py-6 z-30 pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          <button 
            onClick={() => setCommandPaletteOpen(true)}
            className="glass-panel text-white hover:bg-[#373940]/20 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors duration-200 cursor-pointer"
            title="Open global Command Palette (Ctrl+K)"
          >
            <span className="material-symbols-outlined text-[16px] text-[#c0c1ff]">terminal</span>
            Command Palette <kbd className="hidden md:inline bg-white/5 border border-white/10 px-1 py-0.5 rounded text-[9px] font-mono text-[#c7c4d7]/70 ml-1">⌘K</kbd>
          </button>

          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-[#c0c1ff] hover:bg-[#c0c1ff]/90 text-[#1000a9] font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-lg shadow-[#c0c1ff]/10 flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] font-bold">add</span>
            Add Task
          </button>
          
          <button 
            onClick={handleWhatNow}
            disabled={aiCoachLoading || sortedPendingTasks.length === 0}
            className="glass-panel text-[#c0c1ff] hover:bg-[#373940]/20 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors duration-200 disabled:opacity-40"
          >
            {aiCoachLoading ? (
              <span className="material-symbols-outlined animate-spin text-[16px]">hourglass</span>
            ) : (
              <span className="material-symbols-outlined text-[16px] text-[#c0c1ff]">psychology</span>
            )}
            Next Best Move
          </button>
          
          <button 
            onClick={triggerPrioritize}
            disabled={actionLoading}
            className="text-[#c7c4d7] hover:text-[#c0c1ff] p-2 hover:bg-[#373940]/20 rounded-full transition-colors"
            title="Recalculate AI priority scores"
          >
            <span className={`material-symbols-outlined ${actionLoading ? "animate-spin" : ""}`}>
               sync
            </span>
          </button>
        </div>
      </header>

      {/* 2b. Mobile Top Brand Bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#15161e]/80 backdrop-blur-md border-b border-white/5 z-40 flex items-center justify-between px-6 shadow-md">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setActiveTab("dashboard"); setSelectedTask(null); }}>
          <div className="w-8 h-8 rounded-full bg-[#c0c1ff]/20 flex items-center justify-center overflow-hidden border border-white/10">
            <img 
              alt="User Profile" 
              className="w-full h-full object-cover" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBSEhkulsYtUTr38gHQJjRHFw1TfxwLHR_dX_5HEl3_irIqgo0B0qUTZvXGXTlC3iOoXR7SkJCa8Cq7MmjPr6AmJpkAalriJ9I2eqi7qk54dJHBYjKSvlj2_3V-p9LZko9ZSoKR12iq0dW_actBrRkDLkN4rCIg4yinCmBy22k_qWn20Er3alHQPT49RcBgngasgHMG5CnolBinRLhMv6wVzRWnyevsTm31EvaWOD51E2pTe7cPlvtHLhEHCxq4qZ6ObzRCgQ4Pag"
            />
          </div>
          <h1 className="font-bold text-sm text-white flex items-center gap-1">
            Life Saver
            <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse"></span>
          </h1>
        </div>
        
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setCommandPaletteOpen(true)}
            className="p-2 rounded-lg transition-colors flex items-center justify-center cursor-pointer text-[#c7c4d7] hover:text-[#c0c1ff] hover:bg-white/5"
            title="Open global Command Palette"
          >
            <span className="material-symbols-outlined text-[18px]">terminal</span>
          </button>

          <button 
            onClick={() => { setActiveTab("settings"); setSelectedTask(null); }}
            className={`p-2 rounded-lg transition-colors flex items-center justify-center cursor-pointer ${
              activeTab === "settings" && !selectedTask
                ? "bg-[#c0c1ff]/20 text-[#c0c1ff]" 
                : "text-[#c7c4d7] hover:text-white hover:bg-white/5"
            }`}
            title="System Settings"
          >
            <span className="material-symbols-outlined text-[18px]">settings</span>
          </button>

          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-[#c0c1ff] hover:bg-[#c0c1ff]/90 text-[#1000a9] font-bold text-[10px] sm:text-xs px-3 py-2 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-md shadow-[#c0c1ff]/10"
          >
            <span className="material-symbols-outlined text-[14px] font-bold">add</span>
            Add Task
          </button>
        </div>
      </header>

      {/* 3. Main Dynamic Content Canvas */}
      <main className="flex-1 lg:ml-[328px] min-h-screen relative p-4 sm:p-6 md:p-10 lg:p-16 pt-24 pb-32 lg:pt-[100px] lg:pb-16 overflow-y-auto">
        
        {/* Background Ambient Violet/Indigo Glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#c0c1ff]/5 rounded-full blur-[140px] pointer-events-none z-0"></div>
        <div className="absolute bottom-20 left-10 w-[400px] h-[400px] bg-[#d0bcff]/3 rounded-full blur-[120px] pointer-events-none z-0"></div>

        <div className="max-w-5xl mx-auto relative z-10 pb-16">
          
          {/* Detailed Subtask Breakdown View (Screenshot 2) */}
          {selectedTask ? (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Detail Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setSelectedTask(null)}
                    className="w-10 h-10 rounded-full glass-panel flex items-center justify-center hover:bg-[#373940]/40 transition-all duration-200"
                    title="Back to lists"
                  >
                    <span className="material-symbols-outlined text-[#c7c4d7]">arrow_back</span>
                  </button>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#571bc1]/40 text-[#c4abff] font-mono text-[10px] uppercase tracking-wider border border-[#571bc1]/20">
                        Project Phase 2
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#33343b] text-[#c7c4d7] font-mono text-[10px] uppercase tracking-wider">
                        Due: {new Date(selectedTask.deadline).toLocaleDateString()} {new Date(selectedTask.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <h1 className="font-bold text-2xl md:text-3xl mt-2 text-white">Task: {selectedTask.title}</h1>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedTask.title);
                      showToast("Task reference link copied to clipboard.", "success");
                    }}
                    className="px-4 py-2 rounded-lg glass-panel text-xs font-semibold hover:bg-[#373940]/40 transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">share</span> Share
                  </button>
                  <button 
                    onClick={() => openEditModal(selectedTask)}
                    className="px-4 py-2 rounded-lg glass-panel text-xs font-semibold hover:bg-[#373940]/40 transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                  </button>
                </div>
              </div>

              {/* Task Intelligence & Health Dashboard Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Progress Card */}
                <div className="glass-panel p-5 rounded-xl md:col-span-2 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-xs font-semibold text-[#c7c4d7]">Overall Task Progress</span>
                      <span className="font-mono text-xs text-[#c0c1ff] font-bold">
                        {selectedTask.progress !== undefined && selectedTask.progress !== null ? selectedTask.progress : (selectedTask.subtasks 
                          ? Math.round((selectedTask.subtasks.filter(s => s.done).length / selectedTask.subtasks.length) * 100)
                          : selectedTask.status === "completed" ? 100 : 0)}%
                      </span>
                    </div>
                    <div className="w-full h-3 bg-[#33343b] rounded-full overflow-hidden shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-[#571bc1] to-[#c0c1ff] progress-bar-stripes rounded-full shadow-[0_0_12px_rgba(192,193,255,0.4)] transition-all duration-500"
                        style={{ 
                          width: `${selectedTask.progress !== undefined && selectedTask.progress !== null ? selectedTask.progress : (selectedTask.subtasks 
                            ? (selectedTask.subtasks.filter(s => s.done).length / selectedTask.subtasks.length) * 100
                            : selectedTask.status === "completed" ? 100 : 0)}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5 text-xs text-[#c7c4d7]">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#c0c1ff]">folder</span>
                      <span>Project: <span className="font-bold text-white">{selectedTask.project || "General"}</span></span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {(selectedTask.tags || []).map(tag => (
                        <span key={tag} className="font-mono text-[9px] text-[#c0c1ff] bg-[#c0c1ff]/10 px-2 py-0.5 rounded border border-[#c0c1ff]/20">#{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Health & Risk Stats */}
                <div className="glass-panel p-5 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs mb-3">
                    <span className="text-[#c7c4d7] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-emerald-400">health_and_safety</span>
                      Task Health Index
                    </span>
                    <span className={`font-mono text-[9px] uppercase font-bold px-2 py-0.5 rounded ${
                      selectedTask.riskLevel === "Critical" 
                        ? "bg-red-400/20 text-red-300 border border-red-400/30" 
                        : selectedTask.riskLevel === "High" 
                          ? "bg-orange-400/20 text-orange-300 border border-orange-400/30"
                          : "bg-emerald-400/20 text-[#4edea3] border border-[#4edea3]/30"
                    }`}>
                      {selectedTask.riskLevel || "Low"} Risk
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[9px] font-mono text-[#c7c4d7]/70 block uppercase">Confidence</span>
                      <span className="text-xl font-extrabold text-white font-mono">{selectedTask.completionProbability || 75}%</span>
                      <span className="text-[9px] text-emerald-400 block mt-0.5">Success Prob.</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-mono text-[#c7c4d7]/70 block uppercase">Complexity</span>
                      <span className="text-sm font-bold text-[#c0c1ff] flex items-center gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">psychology</span>
                        {selectedTask.difficulty || "Medium"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-[#c7c4d7]">
                    <span>Focus Req:</span>
                    <span className="text-white font-semibold">{selectedTask.focusRequirement || "Standard Focus"}</span>
                  </div>
                </div>
              </div>

              {selectedTask.dependencies && selectedTask.dependencies.length > 0 && (
                <div className="p-4 bg-amber-400/5 border border-amber-400/10 rounded-xl flex items-center gap-2.5 text-xs text-[#c7c4d7] animate-fade-in">
                  <span className="material-symbols-outlined text-amber-400">warning</span>
                  <span>Blocked on pending requirement: <span className="font-bold text-white">{(selectedTask.dependencies || []).map(id => tasks.find(t => t.id === id)?.title || id).join(", ")}</span></span>
                </div>
              )}

              {/* Two Column details workspace */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left: AI Breakdown Checklist */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#c0c1ff]">splitscreen</span>
                      Break It Down
                    </h2>
                    <span className="font-mono text-[10px] text-[#c7c4d7] px-2.5 py-1 rounded-full glass-panel">AI Generated Plan</span>
                  </div>

                  <div className="space-y-3">
                    {selectedTask.subtasks ? (
                      selectedTask.subtasks.map((sub, idx) => (
                        <div 
                          key={sub.id} 
                          className={`glass-panel rounded-xl p-4 flex items-start gap-4 transition-all hover:scale-[1.01] ${sub.done ? "opacity-60" : "glow-border"}`}
                        >
                          <button
                            onClick={() => toggleSubtask(selectedTask, sub.id)}
                            className={`mt-1.5 w-6 h-6 rounded-full border border-white/20 flex items-center justify-center transition-all ${
                              sub.done 
                                ? "bg-[#c0c1ff]/20 text-[#c0c1ff] border-[#c0c1ff] shadow-[0_0_8px_rgba(192,193,255,0.3)]" 
                                : "hover:border-[#c0c1ff]"
                            }`}
                          >
                            {sub.done && <span className="material-symbols-outlined text-[16px] font-bold">check</span>}
                          </button>
                          
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-[9px] text-[#c0c1ff] bg-[#c0c1ff]/10 px-1.5 py-0.5 rounded font-bold uppercase">
                                Step {sub.executionOrder || (idx + 1)}
                              </span>
                              {sub.priority && (
                                <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded font-bold ${
                                  sub.priority === "High" 
                                    ? "bg-red-400/20 text-red-300 border border-red-400/10 animate-pulse-soft" 
                                    : "bg-[#33343b] text-[#c7c4d7]"
                                }`}>
                                  {sub.priority} Priority
                                </span>
                              )}
                              {sub.difficulty && (
                                <span className="text-[9px] font-mono text-[#c7c4d7]/70">
                                  Difficulty: {sub.difficulty}
                                </span>
                              )}
                            </div>
                            <h3 className={`text-sm font-semibold text-[#e2e2eb] ${sub.done ? "line-through text-[#c7c4d7]" : ""}`}>
                              {sub.text}
                            </h3>
                            {sub.estimatedMinutes && (
                              <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[#c7c4d7]/70 font-mono">
                                <span className="material-symbols-outlined text-[12px]">schedule</span>
                                Est. time: {sub.estimatedMinutes} mins
                              </div>
                            )}
                          </div>
                          
                          <span className={`font-mono text-[10px] mt-1.5 ${sub.done ? "text-[#4edea3]" : "text-[#c7c4d7]"}`}>
                            {sub.done ? "Completed" : "Next Up"}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="glass-panel p-12 text-center rounded-xl space-y-4">
                        <span className="material-symbols-outlined text-4xl text-[#c7c4d7]/40">checklist</span>
                        <p className="text-sm text-[#c7c4d7] max-w-sm mx-auto">This task hasn't been broken down into a tactical action checklist yet.</p>
                        <button 
                          onClick={() => handleBreakdown(selectedTask.id)}
                          disabled={actionLoading}
                          className="px-5 py-2 bg-[#c0c1ff]/10 hover:bg-[#c0c1ff]/20 text-[#c0c1ff] font-semibold text-xs rounded-lg py-2 border border-[#c0c1ff]/20 transition-all cursor-pointer"
                        >
                          {actionLoading ? "Breaking it down..." : "Break It Down with AI"}
                        </button>
                      </div>
                    )}

                    {selectedTask.subtasks && (
                      <button 
                        onClick={() => handleBreakdown(selectedTask.id)}
                        disabled={actionLoading}
                        className="w-full py-4 rounded-xl border border-dashed border-white/10 hover:border-[#c0c1ff] text-[#c7c4d7] hover:text-[#c0c1ff] transition-all duration-300 flex items-center justify-center gap-2 text-xs font-semibold bg-[#191b22]/30 hover:bg-[#191b22]/60 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px] animate-spin-slow">auto_awesome</span>
                        {actionLoading ? "Regenerating..." : "Regenerate subtasks list"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Right: AI Reasoning Sidebar */}
                <aside className="lg:col-span-4 space-y-4 h-full">
                  <div className="glass-panel rounded-xl p-5 flex flex-col justify-between h-full space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                        <span className="material-symbols-outlined text-[#d0bcff]">psychology</span>
                        <h3 className="font-bold text-[#e2e2eb] text-sm">AI Coach Insights</h3>
                      </div>

                      <div className="space-y-5 text-xs text-[#c7c4d7] leading-relaxed">
                        <div>
                          <h4 className="font-bold text-[#d0bcff] mb-1 flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-[#d0bcff]"></span>
                            Strategic Alignment
                          </h4>
                          <p>{selectedTask.aiBreakdownInsight || selectedTask.priorityReasoning || "Life Saver AI will automatically evaluate your progress and compile active insights once you start checkmarking completed milestones."}</p>
                        </div>

                        {selectedTask.suggestedResource && (
                          <div>
                            <h4 className="font-bold text-[#c0c1ff] mb-2 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-[#c0c1ff]"></span>
                              Recommended Reference
                            </h4>
                            <div className="p-3 rounded-lg bg-[#1e1f26] border border-white/5 flex items-start gap-3 hover:bg-[#33343b] cursor-pointer transition-colors">
                              <span className="material-symbols-outlined text-[#c7c4d7] text-[18px]">menu_book</span>
                              <div>
                                <span className="block font-semibold text-white text-xs">{selectedTask.suggestedResource.title}</span>
                                <span className="block text-[10px] text-[#c7c4d7] mt-1">Read time: {selectedTask.suggestedResource.readTime}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Deep Focus Resumption Note / Context-Switching Assistant */}
                        <div className="pt-4 border-t border-white/5 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-[#c0c1ff] flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[16px] text-[#c0c1ff]">restore_page</span>
                              Focus Resumption Note
                            </h4>
                            {selectedTask.importance === "High" && (
                              <span className="text-[8px] font-mono font-bold text-red-300 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20">
                                High Priority Focus
                              </span>
                            )}
                          </div>
                          
                          {selectedTask.contextNotes ? (
                            <div className="p-3 rounded-lg bg-[#c0c1ff]/5 border border-[#c0c1ff]/15 text-[#e2e2eb] space-y-2">
                              <p className="text-xs italic leading-relaxed">"{selectedTask.contextNotes}"</p>
                              <div className="flex justify-end">
                                <button
                                  onClick={() => handleGenerateContextNotes(selectedTask.id)}
                                  disabled={actionLoading}
                                  className="text-[9px] text-[#c0c1ff] hover:underline font-mono flex items-center gap-1 cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[12px]">refresh</span>
                                  Regenerate Note
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-lg bg-white/5 border border-dashed border-white/10 text-center space-y-2">
                              <p className="text-[11px] text-[#c7c4d7]/70">No context-switching notes found for this deep focus session.</p>
                              <button
                                onClick={() => handleGenerateContextNotes(selectedTask.id)}
                                disabled={actionLoading}
                                className="w-full py-1.5 bg-[#c0c1ff]/10 hover:bg-[#c0c1ff]/20 text-[#c0c1ff] font-bold text-[10px] rounded border border-[#c0c1ff]/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                                {actionLoading ? "Synthesizing..." : "Generate Resumption Note"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse"></span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#c7c4d7]">Pacing actively monitored</span>
                    </div>
                  </div>
                </aside>

              </div>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              
              {/* TABS CONTROLLERS */}

              {/* Tab 1: Dashboard View */}
              {activeTab === "dashboard" && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="space-y-8 pb-12"
                >
                  {/* Hero Greeting Segment */}
                  <header className="relative bg-gradient-to-r from-[#181922] via-[#1a1b26] to-[#12131a] border border-white/5 rounded-2xl p-6 sm:p-8 overflow-hidden group">
                    {/* Glowing aesthetic background orb */}
                    <div className="absolute top-[-50px] right-[-50px] w-96 h-96 bg-[#c0c1ff]/10 rounded-full blur-3xl pointer-events-none group-hover:bg-[#c0c1ff]/15 transition-all duration-700"></div>
                    <div className="absolute bottom-[-50px] left-[-50px] w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-medium text-xs tracking-widest text-[#c0c1ff] bg-[#c0c1ff]/10 border border-[#c0c1ff]/20 px-3 py-1 rounded-full uppercase">
                            AI Executive Assistant
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse"></span>
                          <span className="font-mono text-[10px] text-[#4edea3] uppercase tracking-wider font-semibold">Active</span>
                        </div>
                        <h1 className="font-sans font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
                          {(() => {
                            const hour = new Date().getHours();
                            if (hour >= 5 && hour < 12) return `Good Morning, ${userName} 👋`;
                            if (hour >= 12 && hour < 17) return `Good Afternoon, ${userName} 👋`;
                            if (hour >= 17 && hour < 20) return `Good Evening, ${userName} 👋`;
                            return `Good Night, ${userName} 🌙`;
                          })()}
                        </h1>
                        <p className="font-mono text-xs text-[#c0c1ff] font-semibold tracking-wide">
                          {new Date().toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric"
                          })}
                        </p>
                        <div className="pt-2 flex items-start gap-2.5 max-w-2xl">
                          <span className="material-symbols-outlined text-[#c0c1ff] text-[18px] mt-0.5 shrink-0 animate-pulse-soft">psychology</span>
                          <p className="text-xs text-[#c7c4d7] leading-relaxed">
                            <span className="font-bold text-[#c0c1ff]">Life Saver Advice:</span> {getAIVerbalInsight()}
                          </p>
                        </div>
                      </div>

                      {/* Productivity Level Gauge */}
                      <div className="glass-panel-heavy p-4 rounded-xl border border-white/15 text-center min-w-[150px] shadow-lg shadow-black/10">
                        <div className="text-[10px] font-mono text-[#c7c4d7]/80 uppercase tracking-widest font-bold">Focus Efficacy</div>
                        <div className="text-4xl font-extrabold text-white font-mono my-1 tracking-tight">
                          {Math.min(100, Math.max(30, Math.round(85 + (completedTasks.length * 4) - (sortedPendingTasks.filter(t => getCountdown(t.deadline).isOverdue).length * 8))))}%
                        </div>
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4edea3]/15 text-[#4edea3] text-[9px] font-bold font-mono">
                          <span className="w-1 h-1 rounded-full bg-[#4edea3]"></span>
                          OPTIMAL LEVEL
                        </div>
                      </div>
                    </div>
                  </header>

                  {/* Today's Overview (Statistics Bento Row - 8 Cards) */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#c0c1ff] text-[20px]">bento_menu</span>
                      <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#c7c4d7]">Today's Performance Overview</h3>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                      {[
                        { 
                          icon: "flag", 
                          iconColor: "text-red-400", 
                          bgColor: "bg-red-400/5 border-red-400/10",
                          val: sortedPendingTasks.filter(t => t.importance === "High").length, 
                          label: "High Priority", 
                          trend: "Targets" 
                        },
                        { 
                          icon: "event_busy", 
                          iconColor: "text-amber-400", 
                          bgColor: "bg-amber-400/5 border-amber-400/10",
                          val: sortedPendingTasks.filter(t => { 
                            const ms = new Date(t.deadline).getTime() - Date.now(); 
                            return ms > 0 && ms < 24 * 60 * 60 * 1000; 
                          }).length, 
                          label: "Due <24h", 
                          trend: "Critical" 
                        },
                        { 
                          icon: "bolt", 
                          iconColor: "text-[#c0c1ff]", 
                          bgColor: "bg-[#c0c1ff]/5 border-[#c0c1ff]/10",
                          val: `${Math.min(100, Math.max(30, Math.round(85 + (completedTasks.length * 4) - (sortedPendingTasks.filter(t => getCountdown(t.deadline).isOverdue).length * 8))))}%`, 
                          label: "Focus Score", 
                          trend: "Top 5%" 
                        },
                        { 
                          icon: "local_fire_department", 
                          iconColor: "text-orange-400", 
                          bgColor: "bg-orange-400/5 border-orange-400/10",
                          val: `${streak}d`, 
                          label: "Daily Streak", 
                          trend: "Consist" 
                        },
                        { 
                          icon: "trending_up", 
                          iconColor: "text-[#4edea3]", 
                          bgColor: "bg-[#4edea3]/5 border-[#4edea3]/10",
                          val: completedTasks.length >= 3 ? "Hyper" : completedTasks.length >= 1 ? "Flow" : "Calm", 
                          label: "Predict Mode", 
                          trend: "Optimal" 
                        },
                        { 
                          icon: "warning", 
                          iconColor: "text-rose-400", 
                          bgColor: "bg-rose-400/5 border-rose-400/10",
                          val: sortedPendingTasks.filter(t => { 
                            const r = calculateRisk(t); 
                            return r.level === "Critical" || r.level === "High Risk"; 
                          }).length, 
                          label: "At Risk", 
                          trend: "Alerts" 
                        },
                        { 
                          icon: "hourglass_empty", 
                          iconColor: "text-purple-400", 
                          bgColor: "bg-purple-400/5 border-purple-400/10",
                          val: `${deepFocusTime}m`, 
                          label: "Deep Work", 
                          trend: "Focus" 
                        },
                        { 
                          icon: "donut_large", 
                          iconColor: "text-[#4edea3]", 
                          bgColor: "bg-[#4edea3]/5 border-[#4edea3]/10",
                          val: `${tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%`, 
                          label: "Completions", 
                          trend: `${completedTasks.length}/${tasks.length}` 
                        }
                      ].map((stat, idx) => (
                        <div 
                          key={idx} 
                          className={`glass-panel rounded-xl p-4 flex flex-col justify-between hover:bg-[#373940]/15 hover:border-white/20 hover:scale-[1.04] transition-all duration-300 border ${stat.bgColor}`}
                        >
                          <div className="flex justify-between items-start">
                            <span className={`material-symbols-outlined ${stat.iconColor} text-[18px]`}>{stat.icon}</span>
                            <span className="font-mono text-[8px] text-[#c7c4d7] px-1 bg-white/5 border border-white/5 rounded">
                              {stat.trend}
                            </span>
                          </div>
                          <div className="mt-4">
                            <div className="text-xl sm:text-2xl font-bold text-white font-mono leading-none tracking-tight">{stat.val}</div>
                            <div className="text-[10px] text-[#c7c4d7]/90 mt-1.5 font-medium truncate">{stat.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Redesigned Centerpiece Grid: AI recommendation centerpiece (Left) & Focus Timer component (Right) */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Centered Recommendation Card (Left) */}
                    <div className="lg:col-span-7 bg-[#13111c]/70 backdrop-blur-3xl border border-[#c0c1ff]/35 shadow-[0_0_50px_rgba(192,193,255,0.15)] rounded-2xl p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between group min-h-[420px] transition-all duration-500 hover:border-[#c0c1ff]/50">
                      <div className="absolute -top-24 -right-24 w-80 h-80 bg-gradient-to-br from-[#c0c1ff]/15 to-transparent rounded-full blur-3xl pointer-events-none"></div>
                      
                      <div>
                        <div className="flex justify-between items-center mb-6">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl animate-pulse-soft">🧠</span>
                            <div>
                              <span className="font-mono text-xs text-[#c0c1ff] tracking-wider uppercase font-bold flex items-center gap-1.5">
                                AI Core Assistant Centerpiece
                                <span className="w-1.5 h-1.5 rounded-full bg-[#c0c1ff] animate-ping"></span>
                              </span>
                              <p className="text-[10px] font-mono text-[#c7c4d7]/70 mt-0.5">Continuous Decision Optimization Engine</p>
                            </div>
                          </div>
                          
                          {sortedPendingTasks[0] && (
                            <div className="font-mono text-[9px] font-bold bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full text-red-400 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                              Priority Match
                            </div>
                          )}
                        </div>

                        <div className="space-y-4">
                          <span className="text-[#c7c4d7] font-mono text-[10px] uppercase tracking-widest block mb-1">Recommended Direct Focus Target</span>
                          <h2 className="font-sans font-extrabold text-2xl sm:text-3xl text-white tracking-tight leading-tight group-hover:text-[#c0c1ff] transition-colors duration-300">
                            {sortedPendingTasks[0] ? sortedPendingTasks[0].title : "Backlog Is Completely Settled!"}
                          </h2>

                          {sortedPendingTasks[0] ? (
                            <div className="space-y-4">
                              <div className="bg-[#1e1f26]/80 p-4 rounded-xl border border-white/5 space-y-2.5">
                                <span className="text-[9px] font-mono text-[#c0c1ff] uppercase tracking-wider block font-bold">AI Predictive Reasoning</span>
                                <p className="text-xs text-[#e2e2eb] leading-relaxed">
                                  {sortedPendingTasks[0].priorityReasoning || "This high-importance item is currently leading your productivity queue. Initiating a dedicated focus session right now is estimated to increase your weekly completion score."}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#1e1f26]/60 p-3 rounded-lg border border-white/5">
                                  <span className="text-[9px] font-mono text-[#c7c4d7]/80 uppercase block">Workload Effort</span>
                                  <span className="font-mono text-sm text-[#c0c1ff] font-bold">{sortedPendingTasks[0].estimatedMinutes} minutes</span>
                                </div>
                                <div className="bg-[#1e1f26]/60 p-3 rounded-lg border border-white/5">
                                  <span className="text-[9px] font-mono text-[#c7c4d7]/80 uppercase block">Deadline Risk</span>
                                  <span className="font-mono text-sm text-amber-400 font-bold">
                                    {calculateRisk(sortedPendingTasks[0]).percentage}% ({calculateRisk(sortedPendingTasks[0]).level})
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-[#1e1f26]/80 p-5 rounded-xl border border-white/5 mt-2">
                              <p className="text-xs text-[#c7c4d7] leading-relaxed">
                                Outstanding consistency. No pending targets require priority attention. This clear window represents the ideal opportunity to consult your coaching planner for fresh strategic milestones.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-8 pt-4 border-t border-white/5">
                        <p className="text-[11px] text-[#c7c4d7]/80">Guiding you dynamically to take decision-free actions.</p>
                        {sortedPendingTasks[0] ? (
                          <div className="flex gap-2.5">
                            <button 
                              onClick={() => {
                                const task = sortedPendingTasks[0];
                                setFocusTimerTask(task);
                                setFocusTimeLeft(task.estimatedMinutes * 60);
                                setFocusTimeTotal(task.estimatedMinutes * 60);
                                setFocusIsRunning(true);
                                showToast(`🎯 Pomodoro focus loaded: "${task.title}"`, "success");
                              }}
                              className="bg-[#c0c1ff] hover:bg-[#b0b2ff] text-[#1000a9] font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-md hover:scale-[1.03] active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">timer</span>
                              Deep Session
                            </button>
                            <button 
                              onClick={() => handleBreakdown(sortedPendingTasks[0].id)}
                              className="bg-[#1e1f26]/80 border border-white/10 text-white hover:bg-[#1e1f26] font-bold text-xs px-5 py-3 rounded-xl transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
                            >
                              Breakdown
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setShowAddModal(true)}
                            className="bg-[#c0c1ff] hover:bg-[#b0b2ff] text-[#1000a9] font-bold text-xs px-6 py-3 rounded-xl transition-all cursor-pointer hover:scale-[1.03]"
                          >
                            Create Target
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Interactive Focus Timer Dashboard Card (Right) */}
                    <div className="lg:col-span-5 bg-[#181922] border border-white/10 rounded-2xl p-6 flex flex-col justify-between min-h-[420px] relative overflow-hidden group hover:border-white/15 transition-all">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-[#4edea3]/5 rounded-full blur-2xl pointer-events-none"></div>
                      
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <h2 className="text-xs font-mono font-bold text-[#c7c4d7] flex items-center gap-1.5 uppercase">
                            <span className="material-symbols-outlined text-[#4edea3] text-[18px]">hourglass_empty</span>
                            Interactive Focus Deck
                          </h2>
                          <div className="flex gap-1.5">
                            {["25m", "50m", "15m"].map((p) => (
                              <button
                                key={p}
                                onClick={() => {
                                  const mins = p === "25m" ? 25 : p === "50m" ? 50 : 15;
                                  setFocusTimeLeft(mins * 60);
                                  setFocusTimeTotal(mins * 60);
                                  setFocusIsRunning(false);
                                }}
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/5 hover:bg-white/10 text-[#c7c4d7] border border-white/5 hover:text-white transition-colors"
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="block text-[10px] font-semibold text-[#c7c4d7] font-mono uppercase">Select Task to Anchor Focus:</label>
                          <select 
                            value={focusTimerTask ? focusTimerTask.id : ""}
                            onChange={(e) => {
                              const t = tasks.find(item => item.id === e.target.value) || null;
                              setFocusTimerTask(t);
                              if (t) {
                                setFocusTimeLeft(t.estimatedMinutes * 60);
                                setFocusTimeTotal(t.estimatedMinutes * 60);
                              }
                            }}
                            className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2.5 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                          >
                            <option value="">-- Generic Focus Session --</option>
                            {pendingTasks.map(t => (
                              <option key={t.id} value={t.id}>{t.title} ({t.estimatedMinutes}m)</option>
                            ))}
                          </select>
                        </div>

                        {/* Centered Glowing Timer Countdown */}
                        <div className="flex flex-col items-center justify-center my-6 relative py-4">
                          {/* Radial glowing waves while focus active */}
                          <div className="relative w-32 h-32 rounded-full border border-white/5 bg-white/[0.02] flex flex-col items-center justify-center">
                            {focusIsRunning && (
                              <motion.div
                                animate={{ scale: [1, 1.25, 1], opacity: [0.15, 0.05, 0.15] }}
                                transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
                                className="absolute inset-0 rounded-full bg-[#c0c1ff]/20 pointer-events-none"
                              />
                            )}
                            <div className="text-3xl font-bold font-mono text-white select-none">
                              {(() => {
                                const m = Math.floor(focusTimeLeft / 60);
                                const s = focusTimeLeft % 60;
                                return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
                              })()}
                            </div>
                            <div className="text-[9px] font-mono text-[#c0c1ff] uppercase tracking-widest mt-1">
                              {focusIsRunning ? "Active Deep" : "Ready Block"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-center items-center gap-3">
                          <button
                            onClick={() => setFocusIsRunning(!focusIsRunning)}
                            className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer border ${
                              focusIsRunning 
                                ? "bg-red-400/10 text-red-400 border-red-400/20 hover:bg-red-400/20" 
                                : "bg-[#4edea3] hover:bg-[#3ec48f] text-[#100010] border-transparent"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[16px] font-bold">
                              {focusIsRunning ? "pause" : "play_arrow"}
                            </span>
                            {focusIsRunning ? "Pause Block" : "Start Session"}
                          </button>
                          
                          <button
                            onClick={() => {
                              setFocusIsRunning(false);
                              setFocusTimeLeft(focusTimeTotal);
                            }}
                            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors active:scale-95 cursor-pointer"
                            title="Reset Timer"
                          >
                            <span className="material-symbols-outlined text-[16px]">replay</span>
                          </button>
                        </div>

                        {focusTimerTask && (
                          <div className="p-2.5 bg-[#1e1f26] rounded-xl border border-white/5 text-center">
                            <span className="text-[9px] font-mono text-[#c7c4d7]/70 block">ACTIVE ANCHOR TARGET:</span>
                            <span className="text-xs font-semibold text-white truncate block">{focusTimerTask.title}</span>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Quick Actions Grid Row (7 Buttons) */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#c0c1ff] text-[20px]">bolt</span>
                      <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#c7c4d7]">Personal Assistant Quick Actions</h3>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                      {[
                        { 
                          label: "Create Task", 
                          icon: "add_task", 
                          action: () => setShowAddModal(true), 
                          color: "hover:bg-[#c0c1ff]/10 hover:text-[#c0c1ff]" 
                        },
                        { 
                          label: "Plan My Day", 
                          icon: "auto_awesome", 
                          action: () => setActiveTab("planner"), 
                          color: "hover:bg-purple-400/10 hover:text-purple-300" 
                        },
                        { 
                          label: "Ask AI Coach", 
                          icon: "psychology", 
                          action: () => setAiAskOpen(true), 
                          color: "hover:bg-amber-400/10 hover:text-amber-300" 
                        },
                        { 
                          label: "Start Pomodoro", 
                          icon: "timer", 
                          action: () => {
                            const task = sortedPendingTasks[0] || null;
                            setFocusTimerTask(task);
                            setFocusTimeLeft(25 * 60);
                            setFocusTimeTotal(25 * 60);
                            setFocusIsRunning(true);
                            showToast("25-minute Pomodoro focus session initiated!", "success");
                          }, 
                          color: "hover:bg-[#4edea3]/10 hover:text-[#4edea3]" 
                        },
                        { 
                          label: "Open Calendar", 
                          icon: "calendar_today", 
                          action: () => setActiveTab("schedule"), 
                          color: "hover:bg-emerald-400/10 hover:text-emerald-300" 
                        },
                        { 
                          label: "Voice Assistant", 
                          icon: "mic", 
                          action: () => {
                            setVoiceListening(true);
                            setVoiceText("Listening for command...");
                            setTimeout(() => {
                              setVoiceText("Processing voice query: 'Structure study prep tasks'...");
                              setTimeout(() => {
                                setVoiceText("Success: Structured tactical preparation backlog.");
                                showToast("Voice input processed successfully!", "success");
                                setTimeout(() => setVoiceListening(false), 1500);
                              }, 1500);
                            }, 2000);
                          }, 
                          color: "hover:bg-rose-400/10 hover:text-rose-300" 
                        },
                        { 
                          label: "Import Schedule", 
                          icon: "cloud_download", 
                          action: () => showToast("Schedule synced with Google Calendar.", "success"), 
                          color: "hover:bg-blue-400/10 hover:text-blue-300" 
                        }
                      ].map((act, i) => (
                        <button
                          key={i}
                          onClick={act.action}
                          className={`glass-panel p-4 rounded-xl border border-white/5 text-center flex flex-col items-center justify-center gap-2.5 transition-all duration-300 cursor-pointer hover:-translate-y-1 ${act.color}`}
                        >
                          <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]">{act.icon}</span>
                          </div>
                          <span className="text-xs font-semibold tracking-wide">{act.label}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* Upcoming Schedule Timeline & Premium Task Checklist Bento Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Upcoming Tasks Checklist (Left) */}
                    <div className="lg:col-span-8 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#ffb4ab]">flag</span>
                          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#c7c4d7]">Strategic Backlog Checklist</h3>
                        </div>
                        <button 
                          onClick={() => setActiveTab("tasks")}
                          className="text-[#c0c1ff] hover:text-[#d0bcff] text-xs font-semibold flex items-center gap-1 transition-colors font-mono uppercase"
                        >
                          View Backlog <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </button>
                      </div>

                      <div className="space-y-3.5">
                        {sortedPendingTasks.length > 0 ? (
                          sortedPendingTasks.map(t => {
                            const countdown = getCountdown(t.deadline);
                            const msLeft = new Date(t.deadline).getTime() - Date.now();
                            const difficultyLabel = t.estimatedMinutes < 30 ? "Low" : t.estimatedMinutes <= 90 ? "Medium" : "High Focus";
                            const riskLevel = calculateRisk(t);
                            
                            return (
                              <div 
                                key={t.id}
                                className={`group relative bg-[#1e1f26]/40 backdrop-blur-lg rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 hover:scale-[1.01] hover:border-[#c0c1ff]/30 border border-white/5 ${getUrgencyBorder(t.deadline, t.status)}`}
                              >
                                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                  <button 
                                    onClick={() => toggleTaskStatus(t)}
                                    className="mt-1 w-5.5 h-5.5 rounded-lg border border-white/20 hover:border-[#c0c1ff] hover:bg-[#c0c1ff]/10 flex items-center justify-center transition-all cursor-pointer text-transparent hover:text-[#c0c1ff]/80 hover:scale-110"
                                    title="Mark complete"
                                  >
                                    <span className="material-symbols-outlined text-[14px] font-extrabold">check</span>
                                  </button>
                                  
                                  <div className="space-y-1.5 flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                      <h4 className="font-sans font-bold text-white text-md tracking-tight group-hover:text-[#c0c1ff] transition-colors duration-200 truncate">
                                        {t.title}
                                      </h4>
                                      
                                      {/* Countdown Pill */}
                                      <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                        countdown.isOverdue || countdown.text.includes("m left")
                                          ? "bg-red-400/10 text-red-300 border-red-400/20"
                                          : countdown.hours && countdown.hours < 24
                                            ? "bg-amber-400/10 text-amber-300 border-amber-400/20"
                                            : "bg-emerald-400/10 text-emerald-300 border-emerald-400/20"
                                      }`}>
                                        <span className={`w-1 h-1 rounded-full ${
                                          countdown.isOverdue || countdown.text.includes("m left") ? "bg-red-400 animate-pulse" : "bg-emerald-400"
                                        }`}></span>
                                        {countdown.text}
                                      </span>

                                      {/* AI Score pill */}
                                      {t.priorityScore && (
                                        <span className="font-mono text-[9px] text-[#c0c1ff] bg-[#c0c1ff]/10 px-2 py-0.5 rounded-full border border-[#c0c1ff]/25 flex items-center gap-0.5">
                                          <span className="material-symbols-outlined text-[10px]">bolt</span>
                                          AI Score: {t.priorityScore}
                                        </span>
                                      )}
                                    </div>
                                    
                                    <p className="text-xs text-[#c7c4d7] leading-relaxed line-clamp-2">
                                      {t.description || "No tactical details provided. Tap Break it down to define the workspace."}
                                    </p>

                                    {/* Subtasks Progress Bar (Durable & Detailed) */}
                                    {t.subtasks && t.subtasks.length > 0 && (
                                      <div className="mt-3.5 space-y-1.5 bg-[#15161e]/50 p-3 rounded-lg border border-white/5">
                                        <div className="flex justify-between text-[9px] text-[#c7c4d7] font-mono font-bold tracking-wide">
                                          <span>TACTICAL SUBTASKS PROGRESS</span>
                                          <span>{t.subtasks.filter(st => st.status === "completed").length} / {t.subtasks.length}</span>
                                        </div>
                                        <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                                          <div 
                                            className="bg-gradient-to-r from-[#c0c1ff] to-[#4edea3] h-full transition-all duration-500"
                                            style={{ width: `${(t.subtasks.filter(st => st.status === "completed").length / t.subtasks.length) * 100}%` }}
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {/* Task metadata pills row */}
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      <span className="font-mono text-[9px] text-[#c7c4d7] bg-[#33343b]/40 px-2 py-0.5 rounded-full border border-white/5">
                                        Difficulty: {difficultyLabel}
                                      </span>
                                      <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full border border-white/5 flex items-center gap-1 ${riskLevel.color} bg-[#33343b]/40`}>
                                        <span className="w-1 h-1 rounded-full bg-current"></span>
                                        Risk: {riskLevel.level}
                                      </span>
                                      <span className="font-mono text-[9px] text-[#c7c4d7] bg-[#33343b]/40 px-2 py-0.5 rounded-full border border-white/5 flex items-center gap-0.5">
                                        <span className="material-symbols-outlined text-[10px]">schedule</span>
                                        {t.estimatedMinutes}m duration
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 pt-3 md:pt-0 border-t border-white/5 md:border-0 self-end md:self-auto shrink-0">
                                  <button 
                                    onClick={() => handleBreakdown(t.id)}
                                    className="px-3.5 py-1.5 rounded-lg bg-[#33343b]/85 hover:bg-[#33343b] text-white font-bold text-xs transition-all cursor-pointer hover:scale-105 active:scale-95"
                                  >
                                    Breakdown
                                  </button>
                                  <button 
                                    onClick={() => openEditModal(t)}
                                    className="p-1.5 text-[#c7c4d7] hover:text-[#c0c1ff] rounded-lg hover:bg-[#33343b]/50 transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteTask(t.id)}
                                    className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-400/10 transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="glass-panel p-12 text-center rounded-2xl border border-white/5 space-y-5">
                            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center mx-auto shadow-inner shadow-white/5">
                              <span className="material-symbols-outlined text-3xl text-[#c0c1ff] animate-pulse-soft">celebration</span>
                            </div>
                            <div className="space-y-1.5">
                              <h4 className="font-sans font-bold text-white text-md">Strategic Backlog Slipped Clean 🎉</h4>
                              <p className="text-xs text-[#c7c4d7] max-w-sm mx-auto">No outstanding tasks remain today. Use your planner dashboard to populate future goals.</p>
                            </div>
                            <div className="flex justify-center gap-2">
                              <button onClick={() => setShowAddModal(true)} className="px-5 py-2 bg-[#c0c1ff] hover:bg-[#b0b2ff] text-[#1000a9] font-bold text-xs rounded-xl transition-all cursor-pointer">
                                Add Custom Target
                              </button>
                              <button onClick={seedTasks} className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold text-xs rounded-xl transition-all cursor-pointer">
                                Seed Example Tasks
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Upcoming Calendar Timeline Preview (Right) */}
                    <div className="lg:col-span-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#c0c1ff] text-[20px]">schedule</span>
                        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#c7c4d7]">Today's Action Timeline</h3>
                      </div>

                      <div className="glass-panel rounded-2xl p-5 border border-white/5 space-y-5 relative">
                        <div className="absolute top-4 left-6 bottom-4 w-[2px] bg-gradient-to-b from-[#c0c1ff]/30 to-transparent"></div>
                        
                        {sortedPendingTasks.length > 0 ? (
                          sortedPendingTasks.slice(0, 3).map((t, idx) => {
                            const dateObj = new Date(t.deadline);
                            const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                              <div key={t.id} className="relative pl-6 group">
                                <div className={`absolute left-[-3px] top-1 w-2.5 h-2.5 rounded-full border-2 bg-[#111319] group-hover:scale-125 transition-transform ${getUrgencyDotColor(t.deadline, t.status)}`}></div>
                                
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[9px] text-[#c0c1ff] bg-[#c0c1ff]/10 px-1.5 py-0.5 rounded">
                                      {formattedTime}
                                    </span>
                                    <span className="text-[9px] font-mono text-[#4edea3] uppercase tracking-wider font-bold">
                                      {idx === 0 ? "Focus Target" : idx === 1 ? "Deep work" : "Sync session"}
                                    </span>
                                  </div>
                                  <h4 className="font-bold text-white text-xs group-hover:text-[#c0c1ff] transition-all truncate">{t.title}</h4>
                                  <p className="text-[10px] text-[#c7c4d7] line-clamp-1">{t.description || "Active synchronized milestone"}</p>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-[#c7c4d7] text-center py-6">Your agenda is completely clear today.</p>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Analytics Preview & Recent Activity Stream */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
                    
                    {/* Simulated Bento Analytics graph (Left) */}
                    <div className="lg:col-span-7 bg-[#15161e]/60 border border-white/5 p-6 rounded-2xl hover:border-white/10 transition-all duration-300">
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h2 className="text-xs font-mono font-bold text-white uppercase flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[#c0c1ff] text-[18px]">analytics</span>
                            Weekly Workload Productivity Trends
                          </h2>
                          <p className="text-[10px] text-[#c7c4d7] mt-0.5">Focus points acquired against dynamic planned goals</p>
                        </div>
                        <span className="font-mono text-[9px] text-[#c0c1ff] bg-[#c0c1ff]/10 px-2.5 py-0.5 rounded border border-[#c0c1ff]/10 uppercase font-bold">LIVE STATS</span>
                      </div>

                      {/* Bar graph */}
                      <div className="h-44 flex items-end justify-between gap-2 px-1 pb-1 relative">
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.03] py-2">
                          <div className="w-full h-px bg-white"></div>
                          <div className="w-full h-px bg-white"></div>
                          <div className="w-full h-px bg-white"></div>
                        </div>

                        {[
                          { day: "M", h: "45%", score: 45 },
                          { day: "T", h: "70%", score: 70 },
                          { day: "W", h: "90%", score: 90, active: true },
                          { day: "T", h: "55%", score: 55 },
                          { day: "F", h: "40%", score: 40 },
                          { day: "S", h: "20%", score: 20 },
                          { day: "S", h: "15%", score: 15 }
                        ].map((bar, i) => (
                          <div key={i} className="flex flex-col items-center gap-2 w-1/7 group relative z-10">
                            <div className="absolute bottom-full mb-1 bg-[#15161e] border border-white/15 px-2 py-0.5 rounded text-[9px] text-[#c0c1ff] font-bold font-mono opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              {bar.score} pts
                            </div>
                            <div className="w-6 sm:w-8 bg-white/5 hover:bg-white/10 rounded-t-md h-32 flex items-end transition-all">
                              <div 
                                className={`w-full rounded-t-md transition-all duration-700 ${
                                  bar.active 
                                    ? "bg-gradient-to-t from-[#571bc1] to-[#c0c1ff] shadow-[0_0_12px_rgba(192,193,255,0.3)]" 
                                    : "bg-[#c0c1ff]/40"
                                }`} 
                                style={{ height: bar.h }}
                              />
                            </div>
                            <span className={`font-mono text-[10px] ${bar.active ? "text-[#c0c1ff] font-bold" : "text-[#c7c4d7]"}`}>{bar.day}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent Activity Stream (Right) */}
                    <div className="lg:col-span-5 bg-[#15161e]/60 border border-white/5 p-6 rounded-2xl hover:border-white/10 transition-all duration-300">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xs font-mono font-bold text-white uppercase flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-orange-400">local_fire_department</span>
                          AIDA Action Feed
                        </h2>
                        <span className="font-mono text-[9px] text-[#4edea3] bg-[#4edea3]/10 px-2 py-0.5 border border-[#4edea3]/25 rounded uppercase">Verified</span>
                      </div>

                      <div className="space-y-4">
                        {[
                          { action: "Deep Focus Session completed", detail: "Added 50m to study targets", icon: "task_alt", time: "2 hours ago" },
                          { action: "Consistency milestone unlocked", detail: "Daily streak boosted to 5 consecutive days", icon: "workspace_premium", time: "4 hours ago" },
                          { action: "Task prioritized by AI Coach", detail: "Structured milestone roadmap accepted", icon: "auto_awesome", time: "6 hours ago" }
                        ].map((act, idx) => (
                          <div key={idx} className="flex gap-3 text-xs">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/5">
                              <span className="material-symbols-outlined text-xs text-[#c0c1ff]">{act.icon}</span>
                            </div>
                            <div className="flex-1 space-y-0.5">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-white">{act.action}</span>
                                <span className="text-[9px] font-mono text-[#c7c4d7]/70">{act.time}</span>
                              </div>
                              <p className="text-[11px] text-[#c7c4d7]">{act.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* Overlays, modallers, and floating structures */}
                  
                  {/* Floating Voice wave modal */}
                  {voiceListening && (
                    <div className="fixed inset-0 bg-[#0f1015]/85 backdrop-blur-xl z-50 flex items-center justify-center p-4">
                      <div className="glass-panel-heavy rounded-2xl p-8 max-w-sm w-full text-center border border-white/10 shadow-2xl space-y-6 relative overflow-hidden">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-gradient-to-br from-[#c0c1ff]/10 to-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
                        
                        <div className="relative space-y-4">
                          <h4 className="text-xs font-mono text-[#c0c1ff] tracking-widest uppercase font-extrabold">AIDA Voice Assistant</h4>
                          <p className="text-white text-md font-sans font-bold leading-relaxed">{voiceText}</p>
                          
                          {/* Animated voice bar waves using Framer Motion */}
                          <div className="flex justify-center items-center gap-1.5 h-16 py-4">
                            {[1.2, 1.6, 0.8, 2.0, 1.1, 1.4, 0.6].map((rate, i) => (
                              <motion.div 
                                key={i}
                                animate={{ height: [12, 44 * rate, 12] }} 
                                transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.1, ease: "easeInOut" }} 
                                className="w-1 bg-[#c0c1ff] rounded-full"
                                style={{ height: "12px" }}
                              />
                            ))}
                          </div>

                          <p className="text-[10px] font-mono text-[#c7c4d7] tracking-wide">Say "Schedule study session" or "Optimize my deadlines"</p>
                          
                          <button
                            onClick={() => setVoiceListening(false)}
                            className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-[#c7c4d7] hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md"
                          >
                            Close Connection
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ask AI slide-over assistant drawer panel */}
                  {aiAskOpen && (
                    <div className="fixed inset-0 bg-[#0f1015]/80 backdrop-blur-md z-50 flex items-center justify-end p-0">
                      <motion.div 
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 220 }}
                        className="bg-[#15161e] border-l border-white/10 w-full max-w-md h-full p-6 sm:p-8 flex flex-col justify-between shadow-2xl relative"
                      >
                        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-[#c0c1ff]/5 rounded-full blur-3xl pointer-events-none"></div>
                        
                        <div className="space-y-6 flex-1 overflow-y-auto pr-2">
                          <div className="flex items-center justify-between border-b border-white/5 pb-4">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[#c0c1ff] animate-pulse-soft">psychology</span>
                              <span className="font-bold text-white text-md">Life Saver AI Coach</span>
                            </div>
                            <button 
                              onClick={() => setAiAskOpen(false)}
                              className="p-1.5 rounded-lg hover:bg-white/5 text-[#c7c4d7] hover:text-white transition-all"
                            >
                              <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                          </div>

                          <div className="space-y-4">
                            <label className="block text-xs font-semibold text-[#c7c4d7]">Ask Life Saver AI to structure task actions, generate priority plans, or provide concept study guidelines:</label>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                value={aiAskQuery}
                                onChange={(e) => setAiAskQuery(e.target.value)}
                                placeholder="e.g. Help me prepare for next week's exam..."
                                className="flex-1 bg-[#1e1f26] border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAskAICoach(aiAskQuery); }}
                              />
                              <button
                                onClick={() => handleAskAICoach(aiAskQuery)}
                                disabled={aiAskLoading}
                                className="px-4 py-2 bg-[#c0c1ff] hover:bg-[#b0b2ff] text-[#1000a9] font-bold text-xs rounded-lg transition-all flex items-center gap-1 disabled:opacity-40"
                              >
                                {aiAskLoading ? "Analyzing..." : "Ask"}
                              </button>
                            </div>
                          </div>

                          {aiAskResponse && (
                            <div className="space-y-4 pt-4 border-t border-white/5 animate-fade-in">
                              <div className="p-4 rounded-xl bg-[#c0c1ff]/5 border border-[#c0c1ff]/10 text-xs text-white leading-relaxed">
                                <span className="font-bold text-[#c0c1ff] block mb-2 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                                  AI Coach Recommendation:
                                </span>
                                <p className="leading-relaxed text-[#e2e2eb] whitespace-pre-line">{aiAskResponse}</p>
                              </div>
                            </div>
                          )}

                          {suggestedTasks.length > 0 && (
                            <div className="space-y-3 pt-2">
                              <span className="text-xs font-bold text-white block">Suggested Task Actions:</span>
                              <div className="space-y-2">
                                {suggestedTasks.map((s, idx) => (
                                  <div key={idx} className="glass-panel p-4 rounded-xl border border-white/5 space-y-3 flex flex-col justify-between">
                                    <div>
                                      <div className="flex justify-between items-start gap-2">
                                        <h4 className="font-bold text-white text-xs leading-snug">{s.title}</h4>
                                        <span className="text-[9px] font-mono text-[#c0c1ff] bg-[#c0c1ff]/10 px-1.5 py-0.5 rounded uppercase font-bold">{s.importance}</span>
                                      </div>
                                      <p className="text-[11px] text-[#c7c4d7] mt-1 leading-relaxed">{s.description}</p>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px]">
                                      <span className="font-mono text-[#c7c4d7]">Effort: {s.estimatedMinutes}m</span>
                                      <button
                                        onClick={() => insertSuggestedTask(s)}
                                        className="px-2.5 py-1 bg-[#4edea3]/10 hover:bg-[#4edea3]/20 text-[#4edea3] font-bold rounded transition-colors"
                                      >
                                        Insert to Backlog
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-white/5 pt-4 text-[10px] text-[#c7c4d7]/60 text-center font-mono">
                          Active model: gemini-3.5-flash (Standard Tier)
                        </div>
                      </motion.div>
                    </div>
                  )}

                </motion.div>
              )}

              {/* Tab 2: Schedule Timeline View (Screenshot 1) */}
              {activeTab === "schedule" && (
                <motion.div
                  key="schedule"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-8"
                >
                  {/* Top Coach advice */}
                  <header>
                    <h2 className="font-bold text-3xl md:text-4xl text-white tracking-tight mb-2">Your Optimized Schedule</h2>
                    <p className="text-sm text-[#c7c4d7]">Precision planning for maximum productivity and outcome acceleration.</p>
                  </header>

                  <div className="glass-panel p-4 rounded-xl flex items-start gap-3 border border-[#c0c1ff]/10">
                    <span className="material-symbols-outlined text-[#c0c1ff]">auto_awesome</span>
                    <p className="text-xs text-[#c7c4d7] leading-relaxed">
                      Your schedule has been fully prioritized and synchronized by AI coaching engines leveraging your dynamic metrics, current focus scores, and target task importance.
                    </p>
                  </div>

                  {/* Vertical Timeline container */}
                  <div className="relative pl-8 md:pl-12 py-4">
                    {/* Timeline vertical bar line */}
                    <div className="absolute left-0 top-6 bottom-6 w-[2px] timeline-gradient rounded-full"></div>

                    <div className="space-y-6">
                      {sortedPendingTasks.length > 0 ? (
                        sortedPendingTasks.map((t, idx) => {
                          const dateObj = new Date(t.deadline);
                          const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          return (
                            <div key={t.id} className="relative group">
                              
                              {/* Glowing node point */}
                              <div className={`absolute -left-10 md:-left-[54px] top-5 w-4 h-4 rounded-full border-2 bg-[#111319] z-10 transition-transform duration-300 group-hover:scale-125 ${getUrgencyDotColor(t.deadline, t.status)}`}>
                                <div className="absolute inset-0.5 rounded-full bg-[#111319]"></div>
                              </div>

                              <div className="glass-panel glow-border rounded-xl p-5 hover:-translate-y-1 transition-all duration-300">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                  <div>
                                    <div className="flex items-center gap-3 mb-2">
                                      <span className="font-mono text-[10px] text-[#c0c1ff] bg-[#c0c1ff]/10 border border-[#c0c1ff]/20 px-2 py-0.5 rounded-md">
                                        {formattedTime}
                                      </span>
                                      <span className="font-mono text-[9px] text-[#4edea3] uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse"></span>
                                        {idx === 0 ? "Focus Session" : idx === 2 ? "Sync Block" : "Deep Work"}
                                      </span>
                                    </div>
                                    <h3 className="font-bold text-white text-md">{t.title}</h3>
                                  </div>
                                  <button 
                                    onClick={() => setSelectedTask(t)}
                                    className="px-4 py-1.5 bg-[#c0c1ff]/10 border border-[#c0c1ff]/20 hover:bg-[#c0c1ff]/20 rounded-lg font-semibold text-xs text-[#c0c1ff] transition-colors self-start md:self-center cursor-pointer"
                                  >
                                    Start
                                  </button>
                                </div>
                              </div>

                            </div>
                          );
                        })
                      ) : (
                        <div className="glass-panel p-12 text-center rounded-xl space-y-4">
                          <p className="text-sm text-[#c7c4d7]">No active tasks scheduled.</p>
                          <button
                            onClick={seedTasks}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#c0c1ff]/10 border border-[#c0c1ff]/20 hover:bg-[#c0c1ff]/20 text-[#c0c1ff] font-semibold text-xs rounded-xl transition-all cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
                          >
                            <span className="material-symbols-outlined text-[16px]">restore</span>
                            {actionLoading ? "Loading..." : "Load Example Tasks"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Empty state bottom checkmark block */}
                  <div className="pt-10 flex flex-col items-center justify-center text-center">
                    <div className="w-24 h-24 mb-4 opacity-80">
                      <img 
                        alt="Success Checkmark" 
                        className="w-full h-full object-contain" 
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuDWQRyZNKw-nJkvGFuzOcxzYDUtNGAXZ7AHzGDKbljLYs2GNxHwIF3kNnNxJez2_DoT8ETXkvXjZa2tgjjOEvOyUCl88eBaeQCuJeVYJIF4L9lzVNNMvvf5T9mr0NWOx2j4W19-YmhGZs-akdvnoug58UbGNIC_8JOGNCKI6kw4is_Cb4yUQGqDIhZXtV1nzZEBfEeD2IwMEGjYGXvGF2CzoY7IEL9gz8vZLXQBRDDiDR8Fk867AkSq5LR13p4NsyWfSNXqGvSIKA"
                      />
                    </div>
                    <p className="text-xs text-[#c7c4d7] max-w-sm">No more tasks for today. You saved your future self.</p>
                  </div>
                </motion.div>
              )}

              {/* Tab 3: Detailed Tasks List View */}
              {activeTab === "tasks" && (
                <motion.div
                  key="tasks"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="font-bold text-2xl sm:text-3xl text-white tracking-tight">Focus Backlog</h2>
                      <p className="text-sm text-[#c7c4d7]">Strategic roadmap of active milestones and prioritized outcomes.</p>
                    </div>
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="px-4 py-2 bg-[#c0c1ff] text-[#1000a9] font-bold text-xs rounded-lg flex items-center gap-1 shadow-lg shadow-[#c0c1ff]/10 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      New Task
                    </button>
                  </header>

                  <div className="space-y-4">
                    {/* Active Pending Section */}
                    <div className="space-y-3">
                      <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab]"></span>
                        Pending ({sortedPendingTasks.length})
                      </h3>
                      {sortedPendingTasks.length > 0 ? (
                        sortedPendingTasks.map(t => {
                          const countdown = getCountdown(t.deadline);
                          
                          // Dynamic Tooltip parameters
                          const msLeft = new Date(t.deadline).getTime() - Date.now();
                          const urgencyLabel = msLeft < 12 * 60 * 60 * 1000 ? "Critical 🚨" : msLeft < 24 * 60 * 60 * 1000 ? "High ⚠️" : msLeft < 72 * 60 * 60 * 1000 ? "Medium ⚡" : "Low 🛡️";
                          const effortLabel = t.estimatedMinutes < 30 ? "Low (quick win)" : t.estimatedMinutes <= 90 ? "Medium" : "High (deep block)";

                          return (
                            <div 
                              key={t.id}
                              className={`group relative bg-[#1e1f26]/40 backdrop-blur-lg rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 hover:scale-[1.01] hover:-translate-y-0.5 hover:border-[#c0c1ff]/30 shadow-md hover:shadow-[0_12px_40px_rgba(192,193,255,0.06)] border border-white/5 ${getUrgencyBorder(t.deadline, t.status)}`}
                            >
                              <div className="flex items-start gap-3.5 flex-1">
                                <button 
                                  onClick={() => toggleTaskStatus(t)}
                                  className="mt-1 w-5.5 h-5.5 rounded-lg border border-white/20 hover:border-[#c0c1ff] hover:bg-[#c0c1ff]/10 flex items-center justify-center transition-all cursor-pointer text-transparent hover:text-[#c0c1ff]/80 hover:scale-110"
                                  title="Mark complete"
                                >
                                  <span className="material-symbols-outlined text-[14px] font-extrabold">check</span>
                                </button>
                                
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="font-bold text-white text-md tracking-tight group-hover:text-[#c0c1ff] transition-colors duration-200">
                                      {t.title}
                                    </h4>
                                    
                                    {/* Countdown Chip */}
                                    <span className={`font-mono text-[10px] px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                                      countdown.isOverdue || countdown.text.includes("m left") || (countdown.hours && countdown.hours < 2)
                                        ? "bg-red-400/10 text-red-300 border-red-400/20"
                                        : countdown.hours && countdown.hours < 24
                                          ? "bg-amber-400/10 text-amber-300 border-amber-400/20"
                                          : "bg-emerald-400/10 text-emerald-300 border-emerald-400/20"
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        countdown.isOverdue || countdown.text.includes("m left") || (countdown.hours && countdown.hours < 2)
                                          ? "bg-red-400 animate-pulse"
                                          : countdown.hours && countdown.hours < 24
                                            ? "bg-amber-400 animate-pulse-soft"
                                            : "bg-emerald-400"
                                      }`}></span>
                                      {countdown.text}
                                    </span>
 
                                    {/* AI Score Pill with Tooltip */}
                                    {t.priorityScore && (
                                      <div className="relative group/tooltip flex items-center">
                                        <span className="cursor-help font-mono text-[10px] text-[#c0c1ff] bg-[#c0c1ff]/10 px-2.5 py-0.5 rounded-full border border-[#c0c1ff]/20 hover:bg-[#c0c1ff]/20 transition-all flex items-center gap-1">
                                          <span className="material-symbols-outlined text-[12px] text-[#c0c1ff]">bolt</span>
                                          AI Score: {t.priorityScore}
                                        </span>
                                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 bg-[#15161e] border border-[#c0c1ff]/30 p-4 rounded-xl text-xs text-[#c7c4d7] opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200 z-50 shadow-2xl space-y-2.5 backdrop-blur-xl">
                                          <div className="font-bold text-white flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                                            <span className="material-symbols-outlined text-[14px] text-[#c0c1ff]">auto_awesome</span>
                                            <span>Life Saver Priority Breakdown</span>
                                          </div>
                                          <div className="space-y-1.5 font-mono text-[11px]">
                                            <div className="flex justify-between">
                                              <span className="text-[#c7c4d7]/70">Urgency:</span>
                                              <span className="font-bold text-amber-300">{urgencyLabel}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-[#c7c4d7]/70">Importance:</span>
                                              <span className="font-bold text-[#c0c1ff]">{t.importance}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-[#c7c4d7]/70">Effort:</span>
                                              <span className="font-bold text-emerald-400">{effortLabel}</span>
                                            </div>
                                          </div>
                                          <div className="border-t border-white/5 pt-1.5 flex justify-between items-center">
                                            <span className="text-white font-bold">Priority Score:</span>
                                            <span className="text-md font-extrabold text-[#c0c1ff] font-mono">{t.priorityScore}/100</span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
 
                                    {/* Importance Label */}
                                    <span className="font-mono text-[10px] text-[#c7c4d7] bg-[#33343b]/60 px-2.5 py-0.5 rounded-full border border-white/5">
                                      {t.importance}
                                    </span>

                                    {/* Estimated Duration Badge */}
                                    <span className="font-mono text-[10px] text-[#c7c4d7] bg-[#33343b]/60 px-2.5 py-0.5 rounded-full border border-white/5 flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[12px]">schedule</span>
                                      {t.estimatedMinutes || 45}m
                                    </span>
                                  </div>
                                  
                                  <p className="text-xs text-[#c7c4d7] leading-relaxed max-w-2xl">
                                    {t.description || "No tactical details provided."}
                                  </p>

                                  {/* AI Reasoning display on the card */}
                                  {t.priorityReasoning && (
                                    <p className="text-[11px] text-[#c0c1ff]/80 italic mt-1.5 bg-[#c0c1ff]/5 px-2.5 py-1 rounded border border-[#c0c1ff]/10">
                                      🧠 AI Coach: {t.priorityReasoning}
                                    </p>
                                  )}
                                </div>
                              </div>
 
                              <div className="flex items-center gap-2 border-t border-white/5 md:border-0 pt-3 md:pt-0 self-end md:self-auto shrink-0">
                                <button 
                                  onClick={() => setSelectedTask(t)}
                                  className="px-4 py-1.5 rounded-lg bg-[#33343b]/80 hover:bg-[#33343b] text-white font-semibold text-xs transition-colors cursor-pointer hover:scale-105 active:scale-95"
                                >
                                  Check Checklist
                                </button>
                                <button 
                                  onClick={() => openEditModal(t)}
                                  className="p-1.5 text-[#c7c4d7] hover:text-[#c0c1ff] rounded-lg hover:bg-[#33343b]/50 transition-colors hover:scale-110 active:scale-90"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                <button 
                                  onClick={() => handleDeleteTask(t.id)}
                                  className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-400/10 transition-colors hover:scale-110 active:scale-90"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="glass-panel p-12 text-center rounded-2xl border border-[#c0c1ff]/10 max-w-lg mx-auto space-y-6 shadow-2xl relative overflow-hidden group">
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-gradient-to-br from-[#c0c1ff]/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>
                          
                          <div className="relative z-10 space-y-4">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#c0c1ff]/10 to-[#d0bcff]/5 border border-[#c0c1ff]/20 flex items-center justify-center mx-auto shadow-lg shadow-[#c0c1ff]/5 group-hover:scale-105 transition-transform duration-500">
                              <span className="material-symbols-outlined text-4xl text-[#c0c1ff] animate-pulse-soft">celebration</span>
                            </div>
                            
                            <div className="space-y-2">
                              <h4 className="font-sans font-extrabold text-xl text-white tracking-tight">No tasks today 🎉</h4>
                              <p className="text-sm text-[#c0c1ff] font-semibold">You're all caught up.</p>
                              <p className="text-xs text-[#c7c4d7] leading-relaxed max-w-sm mx-auto">
                                Let's save your future self from last-minute panic. Prepare ahead or create a brand new target!
                              </p>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
                              <button
                                onClick={() => setShowAddModal(true)}
                                className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-[#c0c1ff] hover:bg-[#b0b2ff] text-[#1000a9] font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md hover:scale-[1.03] active:scale-[0.98]"
                              >
                                <span className="material-symbols-outlined text-[16px] font-bold">add</span>
                                Create New Goal
                              </button>
                              <button
                                onClick={seedTasks}
                                disabled={actionLoading}
                                className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-[#33343b]/85 hover:bg-[#33343b] text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md hover:scale-[1.03] active:scale-[0.98] border border-white/10"
                              >
                                <span className="material-symbols-outlined text-[16px]">restore</span>
                                {actionLoading ? "Loading..." : "Load Example Tasks"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Completed Section */}
                    {completedTasks.length > 0 && (
                      <div className="space-y-3 pt-6 border-t border-white/5">
                        <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3]"></span>
                          Completed Archive ({completedTasks.length})
                        </h3>
                        {completedTasks.map(t => (
                          <div 
                            key={t.id}
                            className="glass-panel opacity-60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-2 border-l-[#4edea3]"
                          >
                            <div className="flex items-start gap-3 flex-1">
                              <button 
                                onClick={() => toggleTaskStatus(t)}
                                className="mt-1 w-5 h-5 rounded bg-[#4edea3]/20 border border-[#4edea3] flex items-center justify-center cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[14px] text-[#4edea3] font-bold">check</span>
                              </button>
                              <div>
                                <h4 className="font-bold text-white text-md line-through">{t.title}</h4>
                                <p className="text-xs text-[#c7c4d7] line-through">{t.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => toggleTaskStatus(t)}
                                className="text-xs text-[#c0c1ff] hover:underline cursor-pointer"
                              >
                                Restore
                              </button>
                              <button 
                                onClick={() => handleDeleteTask(t.id)}
                                className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-[#33343b]/50"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Tab 4: AI Planner Workspace View */}
              {activeTab === "planner" && (
                <motion.div
                  key="planner"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-8"
                >
                  <header>
                    <h2 className="font-bold text-2xl sm:text-3xl text-white tracking-tight mb-2">AI Planner Workspace</h2>
                    <p className="text-sm text-[#c7c4d7]">Collaborate with Life Saver AI to generate task blueprints, optimize schedules, and remove bottleneck workloads.</p>
                  </header>

                  {/* Planner prompt builder */}
                  <div className="glass-panel rounded-xl p-6 glow-border space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#c0c1ff] animate-pulse-soft">psychology</span>
                      <span className="text-xs font-mono text-[#c0c1ff] uppercase tracking-wider">Coach Alignment Request</span>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-[#c7c4d7]">What objective or project area are we analyzing today?</label>
                      <textarea
                        value={plannerPrompt}
                        onChange={(e) => setPlannerPrompt(e.target.value)}
                        placeholder="e.g. 'I have a job interview prep next week, suggest 3 highly focus-oriented prep tasks.' or 'Draft a list of milestones to optimize my ML assignment validation loop.'"
                        rows={3}
                        className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-3 text-sm focus:border-[#c0c1ff] focus:outline-none focus:ring-1 focus:ring-[#c0c1ff] resize-none"
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="text-[11px] text-[#c7c4d7]">Life Saver AI parses scope patterns to structure high-fidelity checkmark logs.</div>
                      <button
                        onClick={() => handleAIPlannerGenerate(plannerPrompt)}
                        disabled={plannerLoading}
                        className="px-6 py-2.5 bg-[#c0c1ff] hover:bg-[#c0c1ff]/90 text-[#1000a9] font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                      >
                        {plannerLoading ? (
                          <>
                            <span className="material-symbols-outlined animate-spin text-[16px]">hourglass</span>
                            Synthesizing...
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                            Generate suggestions
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Suggestions Display */}
                  {(aiResponse || suggestedTasks.length > 0) && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      {aiResponse && (
                        <div className="p-4 rounded-xl bg-[#c0c1ff]/5 border border-[#c0c1ff]/10 text-xs text-[#c7c4d7] leading-relaxed">
                          <strong>Coach Advice:</strong> {aiResponse}
                        </div>
                      )}

                      <div className="space-y-4">
                        <h3 className="font-bold text-white text-sm">Suggested tasks list ({suggestedTasks.length})</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {suggestedTasks.map((s, idx) => (
                            <div key={idx} className="glass-panel rounded-xl p-5 hover:border-white/10 transition-all flex flex-col justify-between space-y-4">
                              <div>
                                <div className="flex justify-between items-start gap-2 mb-2">
                                  <h4 className="font-bold text-white text-md leading-tight">{s.title}</h4>
                                  <span className="font-mono text-[9px] text-[#c0c1ff] bg-[#c0c1ff]/10 px-2 py-0.5 rounded">
                                    {s.importance}
                                  </span>
                                </div>
                                <p className="text-xs text-[#c7c4d7] leading-relaxed">{s.description}</p>
                              </div>

                              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                <span className="font-mono text-[10px] text-[#c7c4d7]">Duration: ~{s.estimatedMinutes} mins</span>
                                <button 
                                  onClick={() => insertSuggestedTask(s)}
                                  disabled={actionLoading}
                                  className="px-3 py-1 bg-[#4edea3]/10 hover:bg-[#4edea3]/20 text-[#4edea3] font-semibold text-[11px] rounded transition-colors cursor-pointer"
                                >
                                  Insert to Backlog
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Tab 5: Performance Analytics View (Screenshot 3) */}
              {activeTab === "analytics" && (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-8"
                >
                  <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <h2 className="font-bold text-2xl sm:text-3xl text-white tracking-tight mb-2">Performance Analytics</h2>
                      <p className="text-sm text-[#c7c4d7]">Review your focus behaviors, deadline pacing, and productivity streaks.</p>
                    </div>

                    {/* Shimmer insight banner */}
                    <div className="glass-panel p-4 rounded-xl max-w-sm shimmer">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-[#d0bcff] mt-0.5 animate-pulse-soft">psychology</span>
                        <div>
                          <p className="text-xs text-[#e2e2eb]">
                            <span className="font-bold text-[#c0c1ff]">Insight:</span> You are 15% more productive during morning sessions. AI suggests starting your deep work at 8 AM.
                          </p>
                        </div>
                      </div>
                    </div>
                  </header>

                  {/* Bento grids analytics dashboard */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    
                    {/* Weekly Productivity (Large bar graph) */}
                    <div className="glass-panel p-6 rounded-xl col-span-1 md:col-span-8 flex flex-col min-h-[360px] hover:border-white/10 transition-colors duration-300">
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[#c0c1ff] text-[18px]">analytics</span>
                            Weekly Productivity Score Trend
                          </h2>
                          <p className="text-[10px] text-[#c7c4d7] mt-0.5">Calculated by task points completed against planned schedules</p>
                        </div>
                        <span className="font-mono text-[10px] text-[#c0c1ff] bg-[#c0c1ff]/10 px-2 py-0.5 rounded border border-[#c0c1ff]/10 uppercase font-bold">THIS WEEK</span>
                      </div>

                      {/* Custom Simulated Bar Chart */}
                      <div className="flex-1 w-full flex items-end justify-between gap-2 px-2 pb-2 relative min-h-[200px]">
                        
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.05] py-4">
                          <div className="w-full h-px bg-white"></div>
                          <div className="w-full h-px bg-white"></div>
                          <div className="w-full h-px bg-white"></div>
                          <div className="w-full h-px bg-white"></div>
                        </div>

                        {/* Graph bars */}
                        {[
                          { day: "MON", h: "40%", score: 40 },
                          { day: "TUE", h: "65%", score: 65 },
                          { day: "WED", h: "85%", score: 85, active: true },
                          { day: "THU", h: "50%", score: 50 },
                          { day: "FRI", h: "30%", score: 30 },
                          { day: "SAT", h: "15%", score: 15, weekend: true },
                          { day: "SUN", h: "10%", score: 10, weekend: true }
                        ].map((bar, i) => (
                          <div key={i} className="flex flex-col items-center gap-3 w-1/7 group relative z-10">
                            {/* Hover tooltip for score */}
                            <div className="absolute bottom-full mb-1 bg-[#1e1f26] border border-[#c0c1ff]/30 px-2 py-1 rounded text-[9px] text-[#c0c1ff] font-bold font-mono opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              {bar.score} pts
                            </div>
                            <div className="w-6 sm:w-8 md:w-12 bg-white/5 hover:bg-white/10 rounded-t-lg h-40 flex items-end relative transition-colors duration-300">
                              <div 
                                className={`w-full rounded-t-lg transition-all duration-1000 ${
                                  bar.active 
                                    ? "bg-gradient-to-t from-[#571bc1] to-[#c0c1ff] shadow-[0_0_15px_rgba(192,193,255,0.4)]" 
                                    : "bg-gradient-to-t from-[#c0c1ff]/20 to-[#c0c1ff]/70"
                                }`} 
                                style={{ height: bar.h }}
                              ></div>
                            </div>
                            <span className={`font-mono text-[10px] ${bar.active ? "text-[#c0c1ff] font-bold" : "text-[#c7c4d7]"}`}>
                              {bar.day}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Weekly Streak Card (New) */}
                    <div className="glass-panel p-6 rounded-xl col-span-1 md:col-span-4 flex flex-col justify-between min-h-[360px] relative overflow-hidden group hover:border-[#c0c1ff]/30 transition-all duration-300">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-amber-400">local_fire_department</span>
                            Weekly Streak
                          </h2>
                          <span className="font-mono text-[9px] text-[#4edea3] bg-[#4edea3]/10 px-2 py-0.5 rounded border border-[#4edea3]/10">ACTIVE</span>
                        </div>
                        
                        <div className="flex items-center gap-4 my-6">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center text-2xl font-black shadow-lg shadow-orange-500/20 animate-bounce-subtle">
                            🔥
                          </div>
                          <div>
                            <div className="text-3xl font-bold text-white font-mono leading-none">5 Days</div>
                            <p className="text-xs text-[#c7c4d7] mt-1">Daily consistency streak</p>
                          </div>
                        </div>

                        {/* Mon-Sun Streak Tracker Bubbles */}
                        <div className="grid grid-cols-7 gap-1.5 my-6">
                          {[
                            { day: "M", active: true },
                            { day: "T", active: true },
                            { day: "W", active: true },
                            { day: "T", active: true },
                            { day: "F", active: true },
                            { day: "S", active: false },
                            { day: "S", active: false }
                          ].map((d, idx) => (
                            <div key={idx} className="flex flex-col items-center gap-1.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-all duration-300 ${
                                d.active 
                                  ? "bg-gradient-to-br from-amber-500 to-red-500 text-white shadow-md shadow-orange-500/20 scale-105" 
                                  : "bg-[#1e1f26] text-[#c7c4d7] border border-white/5"
                              }`}>
                                {d.active ? "✓" : d.day}
                              </div>
                              <span className="text-[9px] font-mono text-[#c7c4d7]">{d.day}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5 text-xs text-[#c7c4d7] leading-relaxed">
                        <span className="text-[#c0c1ff] font-bold">Life Saver Coach:</span> You are only 2 sessions away from breaking your monthly record. Keep focused!
                      </div>
                    </div>

                    {/* Task Completion Rate Circle Donut */}
                    <div className="glass-panel p-6 rounded-xl col-span-1 md:col-span-4 flex flex-col items-center justify-between relative min-h-[360px] group hover:border-[#c0c1ff]/30 transition-all duration-300">
                      <h2 className="text-sm font-semibold text-white absolute top-6 left-6 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[#c0c1ff] text-[18px]">donut_large</span>
                        Task Completion
                      </h2>
                      
                      <div className="relative w-40 h-40 mt-10 flex items-center justify-center">
                        {/* Circular progress SVG */}
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="10"></circle>
                          <circle 
                            cx="50" cy="50" r="40" fill="none" 
                            stroke="url(#completionGrad)" 
                            strokeWidth="10" 
                            strokeDasharray="251.2" 
                            strokeDashoffset="50.24" // 80% progress
                            strokeLinecap="round"
                            className="transition-all duration-1000"
                          ></circle>
                          <defs>
                            <linearGradient id="completionGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#d0bcff"></stop>
                              <stop offset="100%" stopColor="#c0c1ff"></stop>
                            </linearGradient>
                          </defs>
                        </svg>

                        <div className="absolute flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold text-white font-mono leading-none">80%</span>
                          <span className="text-[9px] font-mono text-[#c7c4d7] uppercase tracking-wider mt-1.5">Completed</span>
                        </div>
                      </div>

                      <div className="flex justify-between w-full text-xs font-mono text-[#c7c4d7] pt-4 border-t border-white/5">
                        <div className="flex flex-col items-center">
                          <span className="text-[#c0c1ff] font-bold text-md leading-none">24</span>
                          <span className="mt-1">Done</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-white font-bold text-md leading-none">6</span>
                          <span className="mt-1">Open</span>
                        </div>
                      </div>
                    </div>

                    {/* Focus Score Line Chart representations */}
                    <div className="glass-panel p-6 rounded-xl col-span-1 md:col-span-4 flex flex-col justify-between h-[360px] relative overflow-hidden group hover:border-[#c0c1ff]/30 transition-all duration-300">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[#d0bcff] text-[18px]">visibility</span>
                          Focus Score Analysis
                        </h2>
                        <div className="bg-[#33343b] border border-white/5 px-2 py-1 rounded-lg font-mono text-[10px] text-[#d0bcff] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">trending_up</span> +12% Focus
                        </div>
                      </div>

                      <div className="flex-1 relative w-full overflow-hidden min-h-[160px] flex flex-col justify-between">
                        <div className="z-10">
                          <span className="text-4xl font-bold font-mono text-white leading-none">88</span>
                          <span className="font-mono text-xs text-[#c7c4d7] ml-1">/100</span>
                          <p className="text-[10px] text-[#c7c4d7] mt-1 font-sans">Focus intensity rating (high flow state)</p>
                        </div>

                        {/* Simulated vector line graph with grid lines and filled gradient */}
                        <div className="relative h-28 w-full mt-4">
                          {/* Grid line values */}
                          <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between pointer-events-none opacity-[0.05]">
                            <div className="w-full h-px bg-white"></div>
                            <div className="w-full h-px bg-white"></div>
                            <div className="w-full h-px bg-white"></div>
                          </div>
                          
                          {/* Area path for glow filler */}
                          <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                            <defs>
                              <linearGradient id="focusAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#d0bcff" stopOpacity="0.25"></stop>
                                <stop offset="100%" stopColor="#d0bcff" stopOpacity="0.0"></stop>
                              </linearGradient>
                            </defs>
                            {/* Comparison helper baseline (lower dashed curve) */}
                            <path
                              d="M0,85 Q20,80 40,75 T80,78 T100,72"
                              fill="none"
                              stroke="rgba(255, 255, 255, 0.1)"
                              strokeWidth="1.5"
                              strokeDasharray="3,3"
                            ></path>
                            {/* Area fill */}
                            <path 
                              d="M0,80 Q10,70 20,85 T40,60 T60,70 T80,30 T100,40 L100,100 L0,100 Z" 
                              fill="url(#focusAreaGrad)"
                            ></path>
                            {/* Main Stroke line */}
                            <path 
                              d="M0,80 Q10,70 20,85 T40,60 T60,70 T80,30 T100,40" 
                              fill="none" 
                              stroke="#d0bcff" 
                              strokeWidth="3" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            ></path>
                            
                            {/* Highlighted hoverable coordinate node points */}
                            <circle cx="20" cy="85" r="2.5" fill="#111319" stroke="#d0bcff" strokeWidth="1.5"></circle>
                            <circle cx="40" cy="60" r="2.5" fill="#111319" stroke="#d0bcff" strokeWidth="1.5"></circle>
                            <circle cx="60" cy="70" r="2.5" fill="#111319" stroke="#d0bcff" strokeWidth="1.5"></circle>
                            <circle cx="80" cy="30" r="4.5" fill="#111319" stroke="#c0c1ff" strokeWidth="2.5" className="animate-pulse"></circle>
                          </svg>
                        </div>
                      </div>
                      
                      <div className="pt-3 border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-[#c7c4d7]">
                        <span>Mon-Fri active average</span>
                        <span className="text-[#c0c1ff] font-bold">82.4 avg</span>
                      </div>
                    </div>

                    {/* Deadline Avoidance Meter progress bar style */}
                    <div className="glass-panel p-6 rounded-xl col-span-1 md:col-span-4 flex flex-col justify-between h-[360px] relative overflow-hidden group hover:border-[#4edea3]/30 transition-all duration-300">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[#4edea3] text-[18px]">timer</span>
                            Deadline Avoidance
                          </h2>
                          <span className="font-mono text-[9px] text-[#4edea3] bg-[#4edea3]/10 px-2 py-0.5 rounded border border-[#4edea3]/10">EXCELLENT</span>
                        </div>
                        <p className="text-xs text-[#c7c4d7] leading-relaxed">Percentage of task backlog milestones completed before estimated deadline target expires.</p>
                      </div>

                      <div className="flex flex-col justify-end space-y-4 my-4">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-5xl font-bold font-mono text-white leading-none">94</span>
                          <span className="text-[#4edea3] font-bold text-2xl">%</span>
                          <span className="text-[10px] text-[#c7c4d7] font-mono ml-2">vs. 84% last month</span>
                        </div>
                        
                        <div className="w-full h-3 bg-[#33343b] rounded-full overflow-hidden relative">
                          <div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-[#4edea3] rounded-full shadow-[0_0_16px_rgba(78,222,163,0.4)] transition-all duration-1000 progress-bar-stripes"
                            style={{ width: "94%" }}
                          ></div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-[#c7c4d7]">
                        <span>Pacing status</span>
                        <span className="text-[#4edea3] font-bold">Safe Zone</span>
                      </div>
                    </div>

                  </div>
                </motion.div>
              )}

              {/* Tab 6: App Settings & Workspace Authentication View */}
              {activeTab === "settings" && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <header>
                    <h2 className="font-bold text-2xl sm:text-3xl text-white tracking-tight">System Settings</h2>
                    <p className="text-sm text-[#c7c4d7]">Configure environment variables, connected services, and study coaching profiles.</p>
                  </header>

                  <div className="space-y-4">
                    <div className="glass-panel rounded-xl p-5 space-y-4">
                      <h3 className="font-bold text-white text-md border-b border-white/5 pb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">account_circle</span>
                        User Account Metadata
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-[#c7c4d7] block mb-1">User Email</span>
                          <span className="text-white font-semibold font-mono">support@lifesaver.ai</span>
                        </div>
                        <div>
                          <span className="text-[#c7c4d7] block mb-1">Assigned Coach Model</span>
                          <span className="text-white font-semibold font-mono">gemini-3.5-flash (Standard Tier)</span>
                        </div>
                      </div>
                    </div>

                    <div className="glass-panel rounded-xl p-5 space-y-4">
                      <h3 className="font-bold text-white text-md border-b border-white/5 pb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">shield</span>
                        Active Secrets Panel
                      </h3>
                      <div className="text-xs space-y-3 leading-relaxed text-[#c7c4d7]">
                        <p>Your workspace is running in secure server-side container proxies. API Keys are safely bound to Node environment contexts.</p>
                        <div className="p-3 bg-[#1e1f26] rounded-lg border border-white/5 flex items-center justify-between">
                          <span className="font-mono text-xs">GEMINI_API_KEY</span>
                          <span className="px-2 py-0.5 rounded bg-[#4edea3]/20 text-[#4edea3] text-[10px] font-mono uppercase font-bold">
                            {geminiActive ? "CONFIGURED (Active)" : "SIMULATED FAILSAFE"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="glass-panel rounded-xl p-5 space-y-4">
                      <h3 className="font-bold text-white text-md border-b border-white/5 pb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">database</span>
                        Workspace Data Management
                      </h3>
                      <div className="text-xs space-y-3 leading-relaxed text-[#c7c4d7]">
                        <p>Need to reset your focus roadmap? Populate your backlog with realistic high-priority and medium-priority academic and professional tasks.</p>
                        <button
                          onClick={seedTasks}
                          disabled={actionLoading}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#c0c1ff] hover:bg-[#b0b2ff] text-[#1000a9] font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">restore</span>
                          {actionLoading ? "Seeding..." : "Restore Default Example Tasks"}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          )}

        </div>
      </main>

      {/* 4. Notification Toast Banner Layer */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={`fixed bottom-6 right-6 p-4 rounded-xl shadow-2xl border flex items-start gap-3 max-w-sm z-50 glass-panel-heavy border-l-4 ${
              toast.type === "success" 
                ? "border-l-[#4edea3]" 
                : toast.type === "error" 
                  ? "border-l-red-400" 
                  : "border-l-[#c0c1ff]"
            }`}
          >
            <span className={`material-symbols-outlined text-[20px] ${
              toast.type === "success" ? "text-[#4edea3]" : toast.type === "error" ? "text-red-400" : "text-[#c0c1ff]"
            }`}>
              {toast.type === "success" ? "check_circle" : toast.type === "error" ? "error" : "info"}
            </span>
            <div className="flex-1">
              <p className="text-xs font-semibold text-white leading-relaxed">{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="text-[#c7c4d7] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. ADD TASK MODAL (S4) */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel-heavy rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 space-y-6 scrollbar-thin"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="font-bold text-lg text-white">Add New Task</h3>
                <button onClick={() => setShowAddModal(false)} className="text-[#c7c4d7] hover:text-white">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleAddTask} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#c7c4d7]">Task Title</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. 'Complete ML Assignment'"
                    className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2.5 text-sm focus:border-[#c0c1ff] focus:outline-none focus:ring-1 focus:ring-[#c0c1ff]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#c7c4d7]">Deadline Target</label>
                    <input
                      type="datetime-local"
                      required
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2.5 text-sm focus:border-[#c0c1ff] focus:outline-none focus:ring-1 focus:ring-[#c0c1ff]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#c7c4d7]">Est. Duration (Minutes)</label>
                    <input
                      type="number"
                      required
                      min={10}
                      value={newEstimate}
                      onChange={(e) => setNewEstimate(Number(e.target.value))}
                      className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2.5 text-sm focus:border-[#c0c1ff] focus:outline-none focus:ring-1 focus:ring-[#c0c1ff]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#c7c4d7]">Importance Level</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Low", "Medium", "High"] as const).map(imp => (
                      <button
                        type="button"
                        key={imp}
                        onClick={() => setNewImportance(imp)}
                        className={`py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          newImportance === imp 
                            ? "bg-[#c0c1ff]/10 text-[#c0c1ff] border-[#c0c1ff]" 
                            : "bg-[#1e1f26] border-white/10 text-[#c7c4d7]"
                        }`}
                      >
                        {imp}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#c7c4d7]">Description & Context</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Enter key reference guidelines or notes..."
                    rows={3}
                    className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2.5 text-sm focus:border-[#c0c1ff] focus:outline-none focus:ring-1 focus:ring-[#c0c1ff] resize-none"
                  />
                </div>

                {/* Advanced smart settings collapsible */}
                <div className="border-t border-white/5 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-[#c0c1ff] hover:text-white font-semibold focus:outline-none cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {showAdvanced ? "expand_less" : "expand_more"}
                    </span>
                    Smart Task Engine Parameters
                  </button>
                  
                  {showAdvanced && (
                    <div className="mt-4 space-y-4 border border-white/5 bg-[#191b22]/30 rounded-xl p-4 animate-fade-in text-left">
                      {/* Project & Tags */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Project Folder</label>
                          <input
                            type="text"
                            value={newProject}
                            onChange={(e) => setNewProject(e.target.value)}
                            placeholder="e.g. 'ML Course', 'Career'"
                            className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Tags (comma-separated)</label>
                          <input
                            type="text"
                            value={newTagsString}
                            onChange={(e) => setNewTagsString(e.target.value)}
                            placeholder="e.g. 'pytorch, academic'"
                            className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Difficulty & Energy */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Complexity / Difficulty</label>
                          <div className="grid grid-cols-3 gap-1">
                            {(["Easy", "Medium", "Hard"] as const).map(diff => (
                              <button
                                type="button"
                                key={diff}
                                onClick={() => setNewDifficulty(diff)}
                                className={`py-1.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                                  newDifficulty === diff 
                                    ? "bg-[#c0c1ff]/15 text-[#c0c1ff] border-[#c0c1ff]/50" 
                                    : "bg-[#1e1f26] border-white/5 text-[#c7c4d7]"
                                }`}
                              >
                                {diff}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Energy Requirement</label>
                          <div className="grid grid-cols-3 gap-1">
                            {(["Low", "Medium", "High"] as const).map(energy => (
                              <button
                                type="button"
                                key={energy}
                                onClick={() => setNewEnergyRequirement(energy)}
                                className={`py-1.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                                  newEnergyRequirement === energy 
                                    ? "bg-[#c0c1ff]/15 text-[#c0c1ff] border-[#c0c1ff]/50" 
                                    : "bg-[#1e1f26] border-white/5 text-[#c7c4d7]"
                                }`}
                              >
                                {energy}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Focus Requirement & Risk Level */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Focus State</label>
                          <select
                            value={newFocusRequirement}
                            onChange={(e: any) => setNewFocusRequirement(e.target.value)}
                            className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                          >
                            <option value="Low Focus">Low Focus (Light Tasks)</option>
                            <option value="Medium Focus">Medium Focus (Standard Tasks)</option>
                            <option value="High Focus">High Focus (Heavier Tasks)</option>
                            <option value="Deep Focus">Deep Focus (Undistracted Sprint)</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Risk Level</label>
                          <select
                            value={newRiskLevel}
                            onChange={(e: any) => setNewRiskLevel(e.target.value)}
                            className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                          >
                            <option value="Low">Low Risk</option>
                            <option value="Medium">Medium Risk</option>
                            <option value="High">High Risk</option>
                            <option value="Critical">Critical Risk</option>
                          </select>
                        </div>
                      </div>

                      {/* Probability & Progress */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-[#c7c4d7]">
                            <span className="font-semibold">Success Probability</span>
                            <span className="font-mono font-bold text-[#c0c1ff]">{newCompletionProbability}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={newCompletionProbability}
                            onChange={(e) => setNewCompletionProbability(Number(e.target.value))}
                            className="w-full h-1 bg-[#33343b] rounded-lg appearance-none cursor-pointer accent-[#c0c1ff]"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-[#c7c4d7]">
                            <span className="font-semibold">Initial Task Progress</span>
                            <span className="font-mono font-bold text-[#c0c1ff]">{newProgress}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={newProgress}
                            onChange={(e) => setNewProgress(Number(e.target.value))}
                            className="w-full h-1 bg-[#33343b] rounded-lg appearance-none cursor-pointer accent-[#c0c1ff]"
                          />
                        </div>
                      </div>

                      {/* Dependencies */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-[#c7c4d7]">Task Dependencies (Must complete first)</label>
                        <div className="max-h-24 overflow-y-auto border border-white/5 bg-[#191b22] rounded-lg p-2.5 space-y-1 text-xs">
                          {tasks.filter(t => !taskToEdit || t.id !== taskToEdit.id).map(t => {
                            const isChecked = newDependencies.includes(t.id);
                            return (
                              <label key={t.id} className="flex items-center gap-2 text-[#c7c4d7] hover:text-white cursor-pointer py-0.5 text-left">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setNewDependencies(prev => prev.filter(id => id !== t.id));
                                    } else {
                                      setNewDependencies(prev => [...prev, t.id]);
                                    }
                                  }}
                                  className="rounded border-white/10 bg-[#1e1f26] text-[#c0c1ff] focus:ring-0"
                                />
                                <span className="truncate">{t.title}</span>
                              </label>
                            );
                          })}
                          {tasks.filter(t => !taskToEdit || t.id !== taskToEdit.id).length === 0 && (
                            <span className="text-[10px] text-[#c7c4d7]/40">No other tasks available.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 bg-[#1e1f26] hover:bg-[#33343b] rounded-lg text-xs font-semibold border border-white/10 text-[#c7c4d7] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#c0c1ff] hover:bg-[#c0c1ff]/90 text-[#1000a9] font-bold text-xs rounded-lg transition-all cursor-pointer"
                  >
                    Add and Analyze
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. EDIT TASK MODAL (S5) */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel-heavy rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 space-y-6 scrollbar-thin"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="font-bold text-lg text-white">Edit Task Details</h3>
                <button onClick={() => setShowEditModal(false)} className="text-[#c7c4d7] hover:text-white">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleEditTask} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#c7c4d7]">Task Title</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2.5 text-sm focus:border-[#c0c1ff] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#c7c4d7]">Deadline Target</label>
                    <input
                      type="datetime-local"
                      required
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2.5 text-sm focus:border-[#c0c1ff] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#c7c4d7]">Est. Duration (Minutes)</label>
                    <input
                      type="number"
                      required
                      value={newEstimate}
                      onChange={(e) => setNewEstimate(Number(e.target.value))}
                      className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2.5 text-sm focus:border-[#c0c1ff] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#c7c4d7]">Importance Level</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Low", "Medium", "High"] as const).map(imp => (
                      <button
                        type="button"
                        key={imp}
                        onClick={() => setNewImportance(imp)}
                        className={`py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          newImportance === imp 
                            ? "bg-[#c0c1ff]/10 text-[#c0c1ff] border-[#c0c1ff]" 
                            : "bg-[#1e1f26] border-white/10 text-[#c7c4d7]"
                        }`}
                      >
                        {imp}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#c7c4d7]">Description & Context</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    rows={3}
                    className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2.5 text-sm focus:border-[#c0c1ff] focus:outline-none focus:ring-1 focus:ring-[#c0c1ff] resize-none"
                  />
                </div>

                {/* Advanced smart settings collapsible */}
                <div className="border-t border-white/5 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-[#c0c1ff] hover:text-white font-semibold focus:outline-none cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {showAdvanced ? "expand_less" : "expand_more"}
                    </span>
                    Smart Task Engine Parameters
                  </button>
                  
                  {showAdvanced && (
                    <div className="mt-4 space-y-4 border border-white/5 bg-[#191b22]/30 rounded-xl p-4 animate-fade-in text-left">
                      {/* Project & Tags */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Project Folder</label>
                          <input
                            type="text"
                            value={newProject}
                            onChange={(e) => setNewProject(e.target.value)}
                            placeholder="e.g. 'ML Course', 'Career'"
                            className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Tags (comma-separated)</label>
                          <input
                            type="text"
                            value={newTagsString}
                            onChange={(e) => setNewTagsString(e.target.value)}
                            placeholder="e.g. 'pytorch, academic'"
                            className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Difficulty & Energy */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Complexity / Difficulty</label>
                          <div className="grid grid-cols-3 gap-1">
                            {(["Easy", "Medium", "Hard"] as const).map(diff => (
                              <button
                                type="button"
                                key={diff}
                                onClick={() => setNewDifficulty(diff)}
                                className={`py-1.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                                  newDifficulty === diff 
                                    ? "bg-[#c0c1ff]/15 text-[#c0c1ff] border-[#c0c1ff]/50" 
                                    : "bg-[#1e1f26] border-white/5 text-[#c7c4d7]"
                                }`}
                              >
                                {diff}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Energy Requirement</label>
                          <div className="grid grid-cols-3 gap-1">
                            {(["Low", "Medium", "High"] as const).map(energy => (
                              <button
                                type="button"
                                key={energy}
                                onClick={() => setNewEnergyRequirement(energy)}
                                className={`py-1.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                                  newEnergyRequirement === energy 
                                    ? "bg-[#c0c1ff]/15 text-[#c0c1ff] border-[#c0c1ff]/50" 
                                    : "bg-[#1e1f26] border-white/5 text-[#c7c4d7]"
                                }`}
                              >
                                {energy}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Focus Requirement & Risk Level */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Focus State</label>
                          <select
                            value={newFocusRequirement}
                            onChange={(e: any) => setNewFocusRequirement(e.target.value)}
                            className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                          >
                            <option value="Low Focus">Low Focus (Light Tasks)</option>
                            <option value="Medium Focus">Medium Focus (Standard Tasks)</option>
                            <option value="High Focus">High Focus (Heavier Tasks)</option>
                            <option value="Deep Focus">Deep Focus (Undistracted Sprint)</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-[#c7c4d7]">Risk Level</label>
                          <select
                            value={newRiskLevel}
                            onChange={(e: any) => setNewRiskLevel(e.target.value)}
                            className="w-full bg-[#1e1f26] border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#c0c1ff] focus:outline-none"
                          >
                            <option value="Low">Low Risk</option>
                            <option value="Medium">Medium Risk</option>
                            <option value="High">High Risk</option>
                            <option value="Critical">Critical Risk</option>
                          </select>
                        </div>
                      </div>

                      {/* Probability & Progress */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-[#c7c4d7]">
                            <span className="font-semibold">Success Probability</span>
                            <span className="font-mono font-bold text-[#c0c1ff]">{newCompletionProbability}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={newCompletionProbability}
                            onChange={(e) => setNewCompletionProbability(Number(e.target.value))}
                            className="w-full h-1 bg-[#33343b] rounded-lg appearance-none cursor-pointer accent-[#c0c1ff]"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-[#c7c4d7]">
                            <span className="font-semibold">Current Task Progress</span>
                            <span className="font-mono font-bold text-[#c0c1ff]">{newProgress}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={newProgress}
                            onChange={(e) => setNewProgress(Number(e.target.value))}
                            className="w-full h-1 bg-[#33343b] rounded-lg appearance-none cursor-pointer accent-[#c0c1ff]"
                          />
                        </div>
                      </div>

                      {/* Dependencies */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-[#c7c4d7]">Task Dependencies (Must complete first)</label>
                        <div className="max-h-24 overflow-y-auto border border-white/5 bg-[#191b22] rounded-lg p-2.5 space-y-1 text-xs">
                          {tasks.filter(t => !taskToEdit || t.id !== taskToEdit.id).map(t => {
                            const isChecked = newDependencies.includes(t.id);
                            return (
                              <label key={t.id} className="flex items-center gap-2 text-[#c7c4d7] hover:text-white cursor-pointer py-0.5 text-left">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setNewDependencies(prev => prev.filter(id => id !== t.id));
                                    } else {
                                      setNewDependencies(prev => [...prev, t.id]);
                                    }
                                  }}
                                  className="rounded border-white/10 bg-[#1e1f26] text-[#c0c1ff] focus:ring-0"
                                />
                                <span className="truncate">{t.title}</span>
                              </label>
                            );
                          })}
                          {tasks.filter(t => !taskToEdit || t.id !== taskToEdit.id).length === 0 && (
                            <span className="text-[10px] text-[#c7c4d7]/40">No other tasks available.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 bg-[#1e1f26] hover:bg-[#33343b] rounded-lg text-xs font-semibold border border-white/10 text-[#c7c4d7] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#c0c1ff] hover:bg-[#c0c1ff]/90 text-[#1000a9] font-bold text-xs rounded-lg transition-all cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. WHAT SHOULD I DO RIGHT NOW MODAL (S8) */}
      <AnimatePresence>
        {showWhatNowModal && recommendation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel-heavy rounded-2xl max-w-md w-full p-6 md:p-8 space-y-6 glow-border"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#c0c1ff] animate-pulse-soft">psychology</span>
                  <span className="text-xs font-mono text-[#c0c1ff] uppercase tracking-wider">Coach Pick</span>
                </div>
                <button onClick={() => setShowWhatNowModal(false)} className="text-[#c7c4d7] hover:text-white">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#c7c4d7] block mb-1">Recommended task</span>
                  <h3 className="font-bold text-xl text-white">{recommendation.title}</h3>
                  <span className="font-mono text-xs text-[#c0c1ff] block mt-1">Estimated duration: {recommendation.estimatedTimeStr}</span>
                </div>

                <div className="p-4 rounded-xl bg-[#c0c1ff]/5 border border-[#c0c1ff]/10 text-xs text-[#c7c4d7] leading-relaxed">
                  <strong>Why now:</strong> {recommendation.reasoning}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-white/5">
                <button
                  onClick={() => setShowWhatNowModal(false)}
                  className="flex-1 py-2.5 bg-[#1e1f26] hover:bg-[#33343b] rounded-lg text-xs font-semibold border border-white/10 text-[#c7c4d7] cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const task = tasks.find(t => t.id === recommendation.id);
                    if (task) {
                      setSelectedTask(task);
                      setShowWhatNowModal(false);
                    }
                  }}
                  className="flex-1 py-2.5 bg-[#c0c1ff] hover:bg-[#c0c1ff]/90 text-[#1000a9] font-bold text-xs rounded-lg transition-all cursor-pointer text-center"
                >
                  Start This Task
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global AI Command Palette */}
      <AnimatePresence>
        {commandPaletteOpen && (
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            tasks={tasks}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            setTasks={setTasks}
            setSelectedTask={setSelectedTask}
            showToast={showToast}
            triggerPrioritize={triggerPrioritize}
            setFocusTimeTotal={setFocusTimeTotal}
            setFocusTimeLeft={setFocusTimeLeft}
            setFocusIsRunning={setFocusIsRunning}
            setFocusTimerTask={setFocusTimerTask}
          />
        )}
      </AnimatePresence>

      {/* 8. Gorgeous Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#1e1f26]/90 backdrop-blur-xl border-t border-white/5 z-45 flex items-center justify-around px-2 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
        {[
          { id: "dashboard", icon: "dashboard", label: "Home" },
          { id: "tasks", icon: "assignment", label: "Tasks" },
          { id: "planner", icon: "psychology", label: "AI Coach" },
          { id: "schedule", icon: "calendar_today", label: "Calendar" },
          { id: "analytics", icon: "monitoring", label: "Charts" }
        ].map(item => {
          const isActive = activeTab === item.id && !selectedTask;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as any);
                setSelectedTask(null);
              }}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all ${
                isActive ? "text-[#c0c1ff]" : "text-[#c7c4d7]/70"
              }`}
            >
              <span className={`material-symbols-outlined text-[20px] mb-0.5 ${isActive ? "text-[#c0c1ff] scale-110 font-bold" : "text-[#c7c4d7]"}`} style={{ fontVariationSettings: isActive ? "'FILL' 1" : "" }}>
                {item.icon}
              </span>
              <span className="text-[9px] font-mono tracking-tight font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

    </div>
  );
}
