import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { Task, Subtask } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10kb" }));

// Initialize Gemini SDK with telemetry header
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

// Error sanitizer to scrub any potential secrets/keys from logs
function sanitizeError(error: any): string {
  if (!error) return "Unknown error";
  let msg = typeof error === "string" ? error : error.message || JSON.stringify(error);
  if (apiKey) {
    const escapedKey = apiKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    msg = msg.replace(new RegExp(escapedKey, 'g'), "REDACTED_API_KEY");
  }
  return msg;
}

if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Gemini SDK:", sanitizeError(error));
  }
} else {
  console.log("Gemini API key is missing or placeholder. Running with smart simulation engine.");
}

// ----------------------------------------------------------------------
// Secure Input Validation and Sanitization Utilities
// ----------------------------------------------------------------------

function sanitizeInput(str: any, maxLength?: number): string {
  if (typeof str !== "string") return "";
  let clean = str.trim();

  // Neutralize potential prompt injection key patterns
  const promptInjectionKeywords = [
    "ignore previous", 
    "ignore all previous", 
    "override instructions", 
    "system prompt", 
    "you are now", 
    "act as", 
    "forget what"
  ];
  const hasInjection = promptInjectionKeywords.some(keyword => 
    clean.toLowerCase().includes(keyword)
  );
  if (hasInjection) {
    clean = clean.replace(/ignore/gi, "[neutralized phrase]");
    clean = clean.replace(/override/gi, "[neutralized phrase]");
  }

  // Strip all HTML and script tags to prevent HTML/XSS injection
  clean = clean.replace(/<[^>]*>/g, "");

  // Escape special HTML characters to secure the strings fully
  clean = clean
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");

  if (maxLength && clean.length > maxLength) {
    clean = clean.substring(0, maxLength);
  }
  return clean;
}

function validateTaskInput(body: any, isUpdate = false): string[] {
  const errors: string[] = [];

  if (!isUpdate) {
    if (!body.title || typeof body.title !== "string" || body.title.trim() === "") {
      errors.push("Title is required and cannot be empty.");
    }
    if (!body.deadline || typeof body.deadline !== "string" || body.deadline.trim() === "") {
      errors.push("Deadline is required and cannot be empty.");
    }
    if (body.estimatedMinutes === undefined || body.estimatedMinutes === null || String(body.estimatedMinutes).trim() === "") {
      errors.push("Estimated time is required.");
    }
    if (!body.importance || typeof body.importance !== "string" || body.importance.trim() === "") {
      errors.push("Importance is required.");
    }
  }

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim() === "") {
      errors.push("Title cannot be empty.");
    } else if (body.title.length > 100) {
      errors.push("Title cannot exceed 100 characters.");
    }
  }

  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      errors.push("Description must be a string.");
    } else if (body.description.length > 500) {
      errors.push("Description cannot exceed 500 characters.");
    }
  }

  if (body.estimatedMinutes !== undefined) {
    const mins = Number(body.estimatedMinutes);
    if (isNaN(mins)) {
      errors.push("Estimated minutes must be a valid number.");
    } else if (mins <= 0) {
      errors.push("Estimated minutes must be a positive number.");
    } else if (mins > 10080) {
      errors.push("Estimated minutes cannot exceed 10080 minutes (1 week).");
    }
  }

  if (body.importance !== undefined) {
    if (!["Low", "Medium", "High"].includes(body.importance)) {
      errors.push("Importance must be 'Low', 'Medium', or 'High'.");
    }
  }

  if (body.deadline !== undefined) {
    if (typeof body.deadline !== "string" || isNaN(Date.parse(body.deadline))) {
      errors.push("Deadline must be a valid Date string.");
    }
  }

  if (body.status !== undefined) {
    if (!["pending", "completed"].includes(body.status)) {
      errors.push("Status must be 'pending' or 'completed'.");
    }
  }

  if (body.subtasks !== undefined && body.subtasks !== null) {
    if (!Array.isArray(body.subtasks)) {
      errors.push("Subtasks must be an array.");
    } else {
      body.subtasks.forEach((sub: any, idx: number) => {
        if (!sub || typeof sub !== "object") {
          errors.push(`Subtask at index ${idx} is invalid.`);
        } else {
          if (!sub.id || typeof sub.id !== "string") {
            errors.push(`Subtask at index ${idx} is missing a valid id.`);
          }
          if (sub.text === undefined || typeof sub.text !== "string" || sub.text.trim() === "") {
            errors.push(`Subtask at index ${idx} text cannot be empty.`);
          } else if (sub.text.length > 200) {
            errors.push(`Subtask at index ${idx} text cannot exceed 200 characters.`);
          }
          if (sub.done === undefined || typeof sub.done !== "boolean") {
            errors.push(`Subtask at index ${idx} status 'done' must be a boolean.`);
          }
        }
      });
    }
  }

  return errors;
}

// Helper to get default initial tasks
function getDefaultTasks(): Task[] {
  return [
    {
      id: "task-1",
      title: "ML Assignment",
      description: "Implement Random Forest and tune hyperparameters using GridSearch. Set up PyTorch and data pipelines.",
      deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
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
      progress: 40, // based on subtasks
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
      },
      contextNotes: "To resume ML Deep Focus block: Open your development workspace, load the PyTorch data loaders, and inspect the validation/training logs of your last run. Start by refactoring or writing the first core utility function for 10 minutes to rebuild flow."
    },
    {
      id: "task-2",
      title: "Internship Preparation",
      description: "Review resume and prepare top 3 STAR method interview stories.",
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
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
      suggestedResource: null,
      contextNotes: "To resume career prep: Clear your desk, open your STAR method templates, and review your top achievements outline. Re-read your key project summary out loud once to immediately regain conversational momentum."
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
    },
    {
      id: "task-4",
      title: "Project Deep Work",
      description: "Write core algorithmic logic, optimize critical paths, and draft tests.",
      deadline: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      estimatedMinutes: 180,
      importance: "High",
      status: "pending",
      createdAt: new Date().toISOString(),
      difficulty: "Hard",
      focusRequirement: "Deep Focus",
      energyRequirement: "High",
      riskLevel: "High",
      completionProbability: 55,
      dependencies: [],
      tags: ["engineering", "coding", "testing"],
      project: "Project X",
      aiSummary: "Writing tests and optimizing code algorithms.",
      progress: 0,
      priorityScore: 90,
      priorityLabel: "High",
      priorityReasoning: "Deep work block. Essential to make steady architecture progress without distractions.",
      subtasks: null,
      aiBreakdownInsight: null,
      suggestedResource: null
    },
    {
      id: "task-5",
      title: "Evaluate Model",
      description: "Run final validation metrics, plot confusion matrix, and document errors.",
      deadline: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      estimatedMinutes: 60,
      importance: "Medium",
      status: "pending",
      createdAt: new Date().toISOString(),
      difficulty: "Medium",
      focusRequirement: "High Focus",
      energyRequirement: "Medium",
      riskLevel: "Medium",
      completionProbability: 80,
      dependencies: ["task-1"], // depends on ML assignment
      tags: ["machine-learning", "validation"],
      project: "ML Course",
      aiSummary: "Final evaluations and validation matrices.",
      progress: 0,
      priorityScore: 75,
      priorityLabel: "High",
      priorityReasoning: "Validating performance is essential before presentation preparation.",
      subtasks: null,
      aiBreakdownInsight: null,
      suggestedResource: null
    }
  ];
}

// In-memory Task Database (Pre-populated matching screenshots)
let tasks: Task[] = getDefaultTasks();

// Helper to simulate prioritization when Gemini is unavailable
function simulatePrioritization(taskList: Task[]): Task[] {
  return taskList.map(t => {
    if (t.status === "completed") {
      return { ...t, priorityScore: 0, priorityLabel: "Low" as const, priorityReasoning: "Task is completed." };
    }
    const msLeft = new Date(t.deadline).getTime() - Date.now();
    const hoursLeft = Math.max(0.1, msLeft / (1000 * 60 * 60));
    
    // Weight parameters: urgency (deadline) + importance + duration
    const urgencyWeight = Math.max(1, 100 - (hoursLeft * 5)); 
    const importanceWeight = t.importance === "High" ? 30 : t.importance === "Medium" ? 15 : 5;
    const durationAdjustment = Math.min(10, t.estimatedMinutes / 15);
    
    const score = Math.min(100, Math.round(urgencyWeight + importanceWeight + durationAdjustment));
    const label = score >= 80 ? "High" as const : score >= 50 ? "Medium" as const : "Low" as const;
    const reasoning = `Deadline is ~${Math.round(hoursLeft)}h away. Simulated AI weighting of urgency and ${t.importance} importance.`;

    return {
      ...t,
      priorityScore: score,
      priorityLabel: label,
      priorityReasoning: t.priorityReasoning || reasoning
    };
  });
}

// Helper to simulate subtask breakdown
function simulateBreakdown(title: string): { subtasks: Subtask[], aiBreakdownInsight: string, suggestedResource: { title: string, readTime: string } } {
  return {
    subtasks: [
      { id: `sim-sub-1-${Date.now()}`, text: `Define scope & gather references for ${title}`, done: false },
      { id: `sim-sub-2-${Date.now()}`, text: `Draft initial architecture/outline`, done: false },
      { id: `sim-sub-3-${Date.now()}`, text: `Implement core logic/features`, done: false },
      { id: `sim-sub-4-${Date.now()}`, text: `Perform rigorous validation and testing`, done: false },
      { id: `sim-sub-5-${Date.now()}`, text: `Final review and preparation`, done: false }
    ],
    aiBreakdownInsight: "This structured roadmap divides the high-level task into manageable milestones, helping bypass starting friction and maintaining a high completion velocity.",
    suggestedResource: {
      title: `${title} Best Practices Guide`,
      readTime: "4 mins"
    }
  };
}

// Helper to simulate "What Should I Do Right Now"
function simulateWhatNow(taskList: Task[]): { recommendedTaskId: string, reasoning: string, estimatedTimeStr: string } {
  const pending = taskList.filter(t => t.status === "pending");
  if (pending.length === 0) {
    return { recommendedTaskId: "", reasoning: "All tasks completed! You saved your future self.", estimatedTimeStr: "" };
  }
  // Select highest score or closest deadline
  const sorted = [...pending].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  const recommended = sorted[0];
  const hours = Math.floor(recommended.estimatedMinutes / 60);
  const mins = recommended.estimatedMinutes % 60;
  const timeStr = hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`;
  return {
    recommendedTaskId: recommended.id,
    reasoning: `Based on its urgent deadline (${new Date(recommended.deadline).toLocaleTimeString()}) and High importance rating, prioritizing this model training/prep minimizes bottleneck risks later.`,
    estimatedTimeStr: timeStr
  };
}

// ---------------------------------------------
// API Endpoints
// ---------------------------------------------

// Status check endpoint (replaces direct process.env usage in client bundles)
app.get("/api/status", (req, res) => {
  res.json({
    geminiActive: !!ai,
    environment: process.env.NODE_ENV || "development"
  });
});

// 1. Get all tasks
app.get("/api/tasks", (req, res) => {
  res.json(tasks);
});

// 2. Create a task
app.post("/api/tasks", async (req, res) => {
  try {
    const errors = validateTaskInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }

    const title = sanitizeInput(req.body.title, 100);
    const description = sanitizeInput(req.body.description, 500);
    const deadline = sanitizeInput(req.body.deadline);
    const estimatedMinutes = Number(req.body.estimatedMinutes);
    const importance = req.body.importance;

    const newTask: Task = {
      id: "task-" + Math.random().toString(36).substring(2, 9),
      title,
      description: description || "",
      deadline,
      estimatedMinutes,
      importance,
      status: "pending",
      createdAt: new Date().toISOString(),
      
      // Smart Task System additions
      difficulty: req.body.difficulty || "Medium",
      focusRequirement: req.body.focusRequirement || "Medium Focus",
      energyRequirement: req.body.energyRequirement || "Medium",
      riskLevel: req.body.riskLevel || "Low",
      completionProbability: req.body.completionProbability !== undefined ? Number(req.body.completionProbability) : 75,
      dependencies: Array.isArray(req.body.dependencies) ? req.body.dependencies : [],
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      project: req.body.project || "General",
      aiSummary: req.body.aiSummary || null,
      progress: req.body.progress !== undefined ? Number(req.body.progress) : 0,
      contextNotes: req.body.contextNotes || null,

      priorityScore: null,
      priorityLabel: null,
      priorityReasoning: null,
      subtasks: null,
      aiBreakdownInsight: null,
      suggestedResource: null
    };

    tasks.push(newTask);

    // Auto prioritize if Gemini key is available, else simulate
    await triggerGlobalPrioritization();

    const created = tasks.find(t => t.id === newTask.id);
    res.status(201).json(created);
  } catch (error: any) {
    console.error("Create task failed:", sanitizeError(error));
    res.status(500).json({ error: "An error occurred while creating the task. Please try again." });
  }
});

// 3. Update a task (e.g. check subtasks, mark complete, modify details)
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) {
      return res.status(404).json({ error: "Task not found" });
    }

    const errors = validateTaskInput(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }

    const currentTask = tasks[taskIndex];
    
    if (req.body.title !== undefined) currentTask.title = sanitizeInput(req.body.title, 100);
    if (req.body.description !== undefined) currentTask.description = sanitizeInput(req.body.description, 500);
    if (req.body.deadline !== undefined) currentTask.deadline = sanitizeInput(req.body.deadline);
    if (req.body.estimatedMinutes !== undefined) currentTask.estimatedMinutes = Number(req.body.estimatedMinutes);
    if (req.body.importance !== undefined) currentTask.importance = req.body.importance;
    if (req.body.status !== undefined) currentTask.status = req.body.status;
    
    // Smart Task updates
    if (req.body.difficulty !== undefined) currentTask.difficulty = req.body.difficulty;
    if (req.body.focusRequirement !== undefined) currentTask.focusRequirement = req.body.focusRequirement;
    if (req.body.energyRequirement !== undefined) currentTask.energyRequirement = req.body.energyRequirement;
    if (req.body.riskLevel !== undefined) currentTask.riskLevel = req.body.riskLevel;
    if (req.body.completionProbability !== undefined) currentTask.completionProbability = Number(req.body.completionProbability);
    if (req.body.dependencies !== undefined) currentTask.dependencies = req.body.dependencies;
    if (req.body.tags !== undefined) currentTask.tags = req.body.tags;
    if (req.body.project !== undefined) currentTask.project = req.body.project;
    if (req.body.aiSummary !== undefined) currentTask.aiSummary = req.body.aiSummary;
    if (req.body.contextNotes !== undefined) currentTask.contextNotes = req.body.contextNotes;
    if (req.body.progress !== undefined) {
      currentTask.progress = Number(req.body.progress);
    } else if (req.body.subtasks !== undefined) {
      // Auto compute progress from subtasks if provided and progress not explicitly set
      if (req.body.subtasks === null || req.body.subtasks.length === 0) {
        currentTask.progress = currentTask.status === "completed" ? 100 : 0;
      } else {
        const completed = req.body.subtasks.filter((sub: any) => sub.done).length;
        currentTask.progress = Math.round((completed / req.body.subtasks.length) * 100);
      }
    }

    if (req.body.subtasks !== undefined) {
      if (req.body.subtasks === null) {
        currentTask.subtasks = null;
      } else {
        currentTask.subtasks = req.body.subtasks.map((sub: any) => ({
          id: sanitizeInput(sub.id),
          text: sanitizeInput(sub.text, 200),
          done: !!sub.done
        }));
      }
    }
    if (req.body.priorityScore !== undefined) currentTask.priorityScore = req.body.priorityScore === null ? null : Math.max(0, Math.min(100, Number(req.body.priorityScore)));
    if (req.body.priorityLabel !== undefined) currentTask.priorityLabel = req.body.priorityLabel;
    if (req.body.priorityReasoning !== undefined) currentTask.priorityReasoning = sanitizeInput(req.body.priorityReasoning, 500);

    // If status changed or deadline changed, we re-prioritize
    if (req.body.status !== undefined || req.body.deadline !== undefined) {
      await triggerGlobalPrioritization();
    }

    res.json(tasks[taskIndex]);
  } catch (error: any) {
    console.error("Update task failed:", sanitizeError(error));
    res.status(500).json({ error: "An error occurred while updating the task. Please try again." });
  }
});

// 4. Delete a task
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const initialLen = tasks.length;
    tasks = tasks.filter(t => t.id !== id);
    if (tasks.length === initialLen) {
      return res.status(404).json({ error: "Task not found" });
    }
    await triggerGlobalPrioritization();
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete task failed:", sanitizeError(error));
    res.status(500).json({ error: "An error occurred while deleting the task." });
  }
});

// 5. Trigger priority ranking via Gemini API
app.post("/api/tasks/prioritize", async (req, res) => {
  try {
    await triggerGlobalPrioritization();
    res.json({ success: true, tasks });
  } catch (error: any) {
    console.error("Prioritization endpoint failed:", sanitizeError(error));
    res.status(500).json({ error: "Failed to prioritize tasks. Fallback simulation active." });
  }
});

// 5b. Seed default example tasks
app.post("/api/tasks/seed", async (req, res) => {
  try {
    tasks = getDefaultTasks();
    await triggerGlobalPrioritization();
    res.json({ success: true, tasks });
  } catch (error: any) {
    console.error("Seed default tasks failed:", sanitizeError(error));
    res.status(500).json({ error: "Failed to restore default example tasks." });
  }
});

// Helper function to rank and update all tasks using Gemini
async function triggerGlobalPrioritization() {
  if (!ai) {
    tasks = simulatePrioritization(tasks);
    return;
  }

  const pendingTasks = tasks.filter(t => t.status === "pending");
  if (pendingTasks.length === 0) {
    return;
  }

  try {
    const prompt = `You are Life Saver AI, an expert real-time productivity coach. Rank the following tasks by optimal priority score (0 to 100), label them ("High", "Medium", or "Low"), and provide a 1-sentence reasoning explaining "Why this matters now" based on their deadline, duration, and importance.
    
    Current Time: ${new Date().toISOString()}

    Tasks list:
    ${JSON.stringify(pendingTasks.map(t => ({
      id: t.id,
      title: sanitizeInput(t.title, 100),
      description: sanitizeInput(t.description, 500),
      deadline: sanitizeInput(t.deadline),
      estimatedMinutes: t.estimatedMinutes,
      importance: t.importance
    })))}

    Return a JSON array of prioritized tasks containing ONLY the prioritized scores, labels, and reasoning.
    Do not alter titles, deadlines, or anything else. Just prioritize.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
      }
    });

    const text = response.text || "";
    const priorityUpdates = JSON.parse(text);

    tasks = tasks.map(t => {
      const update = priorityUpdates.find((u: any) => u.id === t.id);
      if (update) {
        return {
          ...t,
          priorityScore: Math.max(0, Math.min(100, Number(update.priorityScore) || 0)),
          priorityLabel: ["High", "Medium", "Low"].includes(update.priorityLabel) ? update.priorityLabel : "Medium",
          priorityReasoning: sanitizeInput(update.priorityReasoning, 500)
        };
      }
      if (t.status === "completed") {
        return { ...t, priorityScore: 0, priorityLabel: "Low" as const, priorityReasoning: "Completed." };
      }
      return t;
    });

  } catch (error) {
    console.error("Gemini prioritization failed, falling back to simulated calculation:", sanitizeError(error));
    tasks = simulatePrioritization(tasks);
  }
}

// 6. AI Task Breakdown (Split any task into 3-5 subtasks)
app.post("/api/tasks/:id/breakdown", async (req, res) => {
  try {
    const { id } = req.params;
    const task = tasks.find(t => t.id === id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (!ai) {
      const simulated = simulateBreakdown(task.title);
      task.subtasks = simulated.subtasks;
      task.aiBreakdownInsight = simulated.aiBreakdownInsight;
      task.suggestedResource = simulated.suggestedResource;
      return res.json(task);
    }

    const cleanTitle = sanitizeInput(task.title, 100);
    const cleanDescription = sanitizeInput(task.description, 500);

    const prompt = `Break down the following task into 3-5 concise, concrete subtasks/checkpoints.
    Task: "${cleanTitle}"
    Description: "${cleanDescription}"
    Deadline: ${task.deadline}
    Importance: ${task.importance}

    Also provide:
    1. An "insight" block explaining why some steps are critical.
    2. A suggested online/tutorial study resource title with an estimated reading time (e.g., 'Scikit-Learn Ensemble Methods' with '5 mins' read time).

    Return JSON matching the schema precisely.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subtasks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of 3 to 5 clear subtask descriptions"
            },
            aiBreakdownInsight: { type: Type.STRING, description: "A tactical insight on how to tackle these subtasks" },
            suggestedResource: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Highly relevant reference manual or guide" },
                readTime: { type: Type.STRING, description: "Estimated reading time, e.g., '5 mins'" }
              },
              required: ["title", "readTime"]
            }
          },
          required: ["subtasks", "aiBreakdownInsight", "suggestedResource"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    task.subtasks = (parsed.subtasks || []).map((text: string, i: number) => ({
      id: `ai-sub-${i}-${Date.now()}`,
      text: sanitizeInput(text, 200),
      done: false
    }));
    task.aiBreakdownInsight = sanitizeInput(parsed.aiBreakdownInsight, 500) || "AI optimized sequence of steps.";
    task.suggestedResource = parsed.suggestedResource ? {
      title: sanitizeInput(parsed.suggestedResource.title, 200),
      readTime: sanitizeInput(parsed.suggestedResource.readTime, 50)
    } : { title: "General Documentation", readTime: "5 mins" };

    res.json(task);
  } catch (error: any) {
    console.error("Task breakdown failed:", sanitizeError(error));
    const task = tasks.find(t => t.id === req.params.id);
    if (task) {
      const simulated = simulateBreakdown(task.title);
      task.subtasks = simulated.subtasks;
      task.aiBreakdownInsight = simulated.aiBreakdownInsight;
      task.suggestedResource = simulated.suggestedResource;
      return res.json(task);
    }
    res.status(500).json({ error: "Failed to generate task breakdown. Fallback simulation triggered." });
  }
});

// 6b. Generate Context Resumption Notes for deep focus switching
app.post("/api/tasks/:id/context-notes", async (req, res) => {
  try {
    const { id } = req.params;
    const task = tasks.find(t => t.id === id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (!ai) {
      const notes = simulateContextNotes(task.title, task.description || "", task.importance);
      task.contextNotes = notes;
      return res.json(task);
    }

    const cleanTitle = sanitizeInput(task.title, 100);
    const cleanDescription = sanitizeInput(task.description, 500);

    const prompt = `Synthesize a highly effective, concise context-switching "resumption note" (maximum 2-3 sentences or bullet points) for the following task:
    Task Title: "${cleanTitle}"
    Task Description: "${cleanDescription}"
    Focus Requirement: "${task.focusRequirement || "Deep Focus"}"
    Importance: "${task.importance}"

    This resumption note must help a busy user quickly rebuild their cognitive state and overcome starting friction when switching into a deep focus session for this task. It should tell them exactly how to prepare their mental workspace and the very first micro-action to take. Keep it specific, practical, action-oriented, and highly encouraging. Do NOT include generic filler.
    Return JSON matching the schema precisely.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            contextNotes: { type: Type.STRING, description: "A concise 2-3 sentence resumption note helping with context switching and mental preparation" }
          },
          required: ["contextNotes"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    task.contextNotes = sanitizeInput(parsed.contextNotes, 500) || simulateContextNotes(task.title, task.description || "", task.importance);

    res.json(task);
  } catch (error: any) {
    console.error("Context notes generation failed:", sanitizeError(error));
    const task = tasks.find(t => t.id === req.params.id);
    if (task) {
      task.contextNotes = simulateContextNotes(task.title, task.description || "", task.importance);
      return res.json(task);
    }
    res.status(500).json({ error: "Failed to generate context notes. Fallback simulation triggered." });
  }
});

// Helper for offline context notes simulation
function simulateContextNotes(title: string, description: string, importance: string): string {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes("ml") || lowerTitle.includes("pytorch") || lowerTitle.includes("model") || lowerTitle.includes("assignment")) {
    return "To resume ML Deep Focus block: Open your development workspace, load the PyTorch data loaders, and inspect the validation/training logs of your last run. Start by refactoring or writing the first core utility function for 10 minutes to rebuild flow.";
  }
  if (lowerTitle.includes("interview") || lowerTitle.includes("internship") || lowerTitle.includes("career") || lowerTitle.includes("resume")) {
    return "To resume career prep: Clear your desk, open your STAR method templates, and review your top achievements outline. Re-read your key project summary out loud once to immediately regain conversational momentum.";
  }
  if (lowerTitle.includes("planner") || lowerTitle.includes("schedule") || lowerTitle.includes("align")) {
    return "To resume sync: Open your calendar sidebar and list out your absolute high priority constraints. Write down the single biggest bottleneck you want to solve today before drafting any secondary tasks.";
  }
  
  return `To resume "${title}": Close all irrelevant browser tabs, review your subtasks checklist for 2 minutes to eliminate activation energy, and tackle the absolute smallest micro-action first. You've got this!`;
}

// 7. Reccommend "What Should I Do Right Now?"
app.post("/api/tasks/what-now", async (req, res) => {
  try {
    const pending = tasks.filter(t => t.status === "pending");
    if (pending.length === 0) {
      return res.json({ recommendedTaskId: "", reasoning: "All caught up! You saved your future self.", estimatedTimeStr: "" });
    }

    if (!ai) {
      return res.json(simulateWhatNow(tasks));
    }

    const prompt = `Analyze these pending tasks and recommend EXACTLY ONE that the user should start working on RIGHT NOW. Take into account deadlines, estimated times, importance levels, and priority scores.
    Current Time: ${new Date().toISOString()}

    Tasks:
    ${JSON.stringify(pending.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      deadline: t.deadline,
      estimatedMinutes: t.estimatedMinutes,
      importance: t.importance,
      priorityScore: t.priorityScore
    })))}

    Return JSON with the recommended task ID, a robust and motivating reasoning explaining why this is the highest priority right now, and a formatted estimated duration string (e.g., "~2h 30m").`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedTaskId: { type: Type.STRING },
            reasoning: { type: Type.STRING, description: "Motivational explanation of why this specific task is recommended now" },
            estimatedTimeStr: { type: Type.STRING, description: "Formatted string like '~2h 30m'" }
          },
          required: ["recommendedTaskId", "reasoning", "estimatedTimeStr"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({
      recommendedTaskId: sanitizeInput(parsed.recommendedTaskId, 50),
      reasoning: sanitizeInput(parsed.reasoning, 500),
      estimatedTimeStr: sanitizeInput(parsed.estimatedTimeStr, 50)
    });
  } catch (error: any) {
    console.error("What Now failed:", sanitizeError(error));
    res.json(simulateWhatNow(tasks));
  }
});

// 8. Generate suggestions using the AI Planner
app.post("/api/tasks/generate-plan", async (req, res) => {
  try {
    const { prompt: userPrompt } = req.body;

    if (userPrompt !== undefined) {
      if (typeof userPrompt !== "string") {
        return res.status(400).json({ error: "Prompt must be a string value." });
      }
      if (userPrompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt cannot be empty." });
      }
      if (userPrompt.length > 500) {
        return res.status(400).json({ error: "Prompt cannot exceed 500 characters." });
      }
    }

    const cleanPrompt = sanitizeInput(userPrompt || "suggest some relevant next steps for AI development", 500);

    const systemPrompt = `You are Life Saver AI, an advanced productivity coach. Based on the user's prompt (like 'suggest 3 tasks for internship prep' or 'help me with model tuning'), generate 2 to 3 practical, high-fidelity productivity tasks that they should add to their schedule.
    
    Each task should have:
    - title: brief, action-oriented (e.g. 'Read Scikit-Learn ensembles', 'Draft STAR stories')
    - estimatedMinutes: standard realistic minutes (e.g. 45, 90)
    - importance: High, Medium, or Low
    - description: a short description of the scope
    
    Format your response as a JSON object containing 'responseText' (a short greeting/coaching tip) and 'suggestedTasks' (array of suggestions).`;

    if (!ai) {
      const responseText = "Here are a few customized tasks tailored to optimize your performance based on current pacing constraints:";
      const suggestedTasks = [
        {
          title: "Refactor PyTorch Data Loaders",
          estimatedMinutes: 45,
          importance: "High" as const,
          description: "Optimize dataset loading threads to avoid GPU utilization bottlenecks during model training iterations."
        },
        {
          title: "Mock Interview with AI Mentor",
          estimatedMinutes: 60,
          importance: "Medium" as const,
          description: "Conduct a structured session focusing on engineering case studies and STAR methodology structure."
        }
      ];
      return res.json({ responseText, suggestedTasks });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: cleanPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            responseText: { type: Type.STRING },
            suggestedTasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  estimatedMinutes: { type: Type.INTEGER },
                  importance: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["title", "estimatedMinutes", "importance", "description"]
              }
            }
          },
          required: ["responseText", "suggestedTasks"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    const responseText = sanitizeInput(parsed.responseText, 500) || "Here is your custom planner recommendation:";
    const suggestedTasks = (parsed.suggestedTasks || []).map((t: any) => ({
      title: sanitizeInput(t.title, 100),
      estimatedMinutes: Math.max(1, Math.min(1440, Number(t.estimatedMinutes) || 45)),
      importance: ["Low", "Medium", "High"].includes(t.importance) ? t.importance : "Medium",
      description: sanitizeInput(t.description, 500)
    }));

    res.json({ responseText, suggestedTasks });
  } catch (error: any) {
    console.error("Generate plan failed, executing offline heuristic fallback:", sanitizeError(error));
    
    // Smart heuristic mapping based on user's input prompt
    const promptLower = (req.body.prompt || "").toLowerCase();
    let responseText = "Here are a few customized tasks compiled by Life Saver offline planning heuristic:";
    let suggestedTasks: Array<{ title: string; estimatedMinutes: number; importance: "Low" | "Medium" | "High"; description: string }> = [
      {
        title: "Review Priority Task Assignments",
        estimatedMinutes: 30,
        importance: "Medium",
        description: "Review current task requirements, check deadlines, and organize sequence of actions."
      },
      {
        title: "Productivity Buffer Time",
        estimatedMinutes: 45,
        importance: "Low",
        description: "Take a quiet, structured buffer block to rest and align your next mental sprint."
      }
    ];

    if (promptLower.includes("ml") || promptLower.includes("pytorch") || promptLower.includes("model") || promptLower.includes("train")) {
      responseText = "Your custom ML optimization plan is ready (Offline mode):";
      suggestedTasks = [
        {
          title: "Refactor Training Loops",
          estimatedMinutes: 60,
          importance: "High" as const,
          description: "Verify batch structures, learning rate decay setups, and metric logs before running long tuning steps."
        },
        {
          title: "Verify Test Loss Convergence",
          estimatedMinutes: 45,
          importance: "Medium" as const,
          description: "Analyze cross-validation errors and make sure validation loss isn't diverging early."
        }
      ];
    } else if (promptLower.includes("interview") || promptLower.includes("job") || promptLower.includes("career") || promptLower.includes("resume") || promptLower.includes("prep")) {
      responseText = "Your career preparation roadmap is ready (Offline mode):";
      suggestedTasks = [
        {
          title: "Draft STAR Stories",
          estimatedMinutes: 60,
          importance: "High" as const,
          description: "Draft 3 technical case studies highlighting problem resolution, architectural choices, and team collaboration."
        },
        {
          title: "Mock Technical Review",
          estimatedMinutes: 45,
          importance: "Medium" as const,
          description: "Perform simulated coding walkthrough explaining data structures, memory limits, and runtime complexities."
        }
      ];
    } else if (promptLower.includes("design") || promptLower.includes("ui") || promptLower.includes("css") || promptLower.includes("tailwind")) {
      responseText = "Your UI design/styling plan is ready (Offline mode):";
      suggestedTasks = [
        {
          title: "Review Typographic Scales",
          estimatedMinutes: 30,
          importance: "Medium" as const,
          description: "Optimize title tracking, line heights, and margins to establish visual rhythms across main screens."
        },
        {
          title: "Refactor Color Contrast Accents",
          estimatedMinutes: 45,
          importance: "High" as const,
          description: "Verify contrast safety on all active buttons, badge elements, and text banners."
        }
      ];
    }

    res.json({ responseText, suggestedTasks });
  }
});

// Helper offline command parser
function parseCommandOffline(prompt: string): { action: string; responseText: string; extractedData: any } {
  const lower = prompt.toLowerCase();
  
  // 1. Focus session
  if (lower.includes("focus") || lower.includes("pomodoro") || lower.includes("session")) {
    let duration = 25;
    const match = lower.match(/(\d+)\s*(minute|min|hour|h)/);
    if (match) {
      const num = parseInt(match[1]);
      if (lower.includes("hour") || match[2].startsWith("h")) {
        duration = num * 60;
      } else {
        duration = num;
      }
    }
    return {
      action: "start_focus_session",
      responseText: `Starting a ${duration}-minute focus session. Let's make every second count.`,
      extractedData: { duration }
    };
  }

  // 2. Plan day
  if (lower.includes("plan my day") || lower.includes("plan day") || lower.includes("start my day")) {
    return {
      action: "plan_day",
      responseText: "Let's plan your day. Sifting through your tasks to arrange the perfect execution sequence.",
      extractedData: {}
    };
  }

  // 3. Move low priority tasks
  if (lower.includes("move") || lower.includes("reschedule") || lower.includes("postpone")) {
    let importance: "Low" | "Medium" | "High" | "all" = "all";
    if (lower.includes("low")) importance = "Low";
    if (lower.includes("medium")) importance = "Medium";
    if (lower.includes("high")) importance = "High";
    
    let targetDay = "Friday";
    if (lower.includes("tomorrow")) targetDay = "tomorrow";
    else if (lower.includes("monday")) targetDay = "Monday";
    else if (lower.includes("tuesday")) targetDay = "Tuesday";
    else if (lower.includes("wednesday")) targetDay = "Wednesday";
    else if (lower.includes("thursday")) targetDay = "Thursday";
    else if (lower.includes("friday")) targetDay = "Friday";
    else if (lower.includes("saturday")) targetDay = "Saturday";
    else if (lower.includes("sunday")) targetDay = "Sunday";

    return {
      action: "move_tasks",
      responseText: `Rescheduling ${importance === "all" ? "all" : importance + " priority"} tasks to ${targetDay}.`,
      extractedData: { importance, targetDay }
    };
  }

  // 4. Generate weekly schedule
  if (lower.includes("weekly") || lower.includes("week schedule") || lower.includes("plan my week")) {
    return {
      action: "generate_weekly_schedule",
      responseText: "Generating your weekly productivity blueprint.",
      extractedData: {}
    };
  }

  // 5. Show overdue tasks
  if (lower.includes("overdue") || lower.includes("missed") || lower.includes("late")) {
    return {
      action: "show_overdue",
      responseText: "Filtering for overdue tasks. Let's get these bottlenecked items resolved.",
      extractedData: {}
    };
  }

  // 6. Summarize progress
  if (lower.includes("summarize") || lower.includes("summary") || lower.includes("progress")) {
    return {
      action: "summarize_progress",
      responseText: "Analyzing your productivity throughput, focus session history, and completed tasks for today's summary.",
      extractedData: {}
    };
  }

  // 7. Create task
  if (lower.includes("create") || lower.includes("add") || lower.includes("task") || lower.includes("todo")) {
    // Extract title
    let title = "New Task";
    const cleanPrompt = prompt.replace(/create a task to|create task|add task|add todo|create todo/i, "").trim();
    const titleMatch = cleanPrompt.match(/^[^.?!,;]+/);
    if (titleMatch) {
      title = titleMatch[0].trim();
    }
    
    // Clean up typical trailing details like "tomorrow"
    title = title.replace(/\b(tomorrow|today|before|at|by|pm|am|minutes|hours)\b.*$/i, "").trim();
    if (!title) title = "Quick Task";

    // Extract deadline
    let deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Default tomorrow
    if (lower.includes("today")) {
      deadline = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours from now
    } else if (lower.includes("friday")) {
      const d = new Date();
      d.setDate(d.getDate() + (5 + 7 - d.getDay()) % 7);
      d.setHours(17, 0, 0, 0);
      deadline = d.toISOString();
    }

    // Extract minutes
    let estimatedMinutes = 45;
    const minMatch = lower.match(/(\d+)\s*(min|minute|hour|h)/);
    if (minMatch) {
      const val = parseInt(minMatch[1]);
      if (lower.includes("hour") || minMatch[2].startsWith("h")) {
        estimatedMinutes = val * 60;
      } else {
        estimatedMinutes = val;
      }
    }

    // Extract importance
    let importance: "Low" | "Medium" | "High" = "Medium";
    if (lower.includes("high") || lower.includes("urgent") || lower.includes("critical") || lower.includes("important")) {
      importance = "High";
    } else if (lower.includes("low") || lower.includes("trivial")) {
      importance = "Low";
    }

    return {
      action: "create_task",
      responseText: `Creating task "${title}" estimated at ${estimatedMinutes} minutes with ${importance} importance.`,
      extractedData: {
        title,
        description: `Created via Life Saver Command Palette: ${prompt}`,
        deadline,
        estimatedMinutes,
        importance,
        difficulty: estimatedMinutes > 120 ? "Hard" : estimatedMinutes > 45 ? "Medium" : "Easy",
        focusRequirement: estimatedMinutes > 90 ? "Deep Focus" : estimatedMinutes > 45 ? "High Focus" : "Medium Focus",
        energyRequirement: estimatedMinutes > 90 ? "High" : estimatedMinutes > 45 ? "Medium" : "Low",
        riskLevel: importance === "High" ? "High" : "Low",
        tags: ["command-palette"],
        project: "General",
        completionProbability: 80,
        progress: 0
      }
    };
  }

  // 8. General chat response
  return {
    action: "chat_response",
    responseText: `I analyzed your prompt: "${prompt}". You can try asking me to "Create a task to finish my ML homework", "Plan my day", "Start a 45 min focus session", or "Summarize today's progress". How can I support your workflow?`,
    extractedData: {}
  };
}

// 9. AI Command endpoint for Global AI Command Palette
app.post("/api/ai/command", async (req, res) => {
  try {
    const { prompt: userPrompt, currentContext } = req.body;
    if (!userPrompt || typeof userPrompt !== "string" || userPrompt.trim() === "") {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const cleanPrompt = sanitizeInput(userPrompt, 500);

    if (!ai) {
      const offlineResult = parseCommandOffline(cleanPrompt);
      return res.json(offlineResult);
    }

    const currentTimeIso = new Date().toISOString();
    const systemPrompt = `You are Life Saver OS, an intelligent operating system designed to manage productivity through natural language.
Your job is to parse the user's natural language command, identify their intent, and extract relevant parameters into a structured command response.
Classify the intent into exactly one of the following actions:
- "create_task": User wants to create/add/schedule a task or homework. Extract fields: title, description, deadline (ISO date string relative to current time), estimatedMinutes (integer, default 45), importance (Low/Medium/High, default Medium), difficulty (Easy/Medium/Hard), focusRequirement (Low Focus/Medium Focus/High Focus/Deep Focus), energyRequirement (Low/Medium/High), riskLevel (Low/Medium/High/Critical), tags (array of strings), project (string), subtasks (array of strings, optional).
- "plan_day": User wants to map, schedule, or plan their day/schedule/day's agenda.
- "start_focus_session": User wants to start a focus timer/sprint. Extract: duration (number of minutes, default 25), taskTitle (optional string name of task to focus on).
- "move_tasks": User wants to reschedule, postpone, or move tasks. Extract: importance ("Low", "Medium", "High", or "all"), targetDay (string representing a weekday or date).
- "generate_weekly_schedule": User wants to generate or view weekly schedule/layout.
- "show_overdue": User wants to view missed, late, or overdue items.
- "summarize_progress": User wants to summarize completed tasks and today's activity.
- "schedule_meeting": User wants to schedule a meeting or event. Extract: title, time, duration.
- "generate_checklist": Break down a task. Extract: taskTitle, subtasks.
- "chat_response": General productivity Q&A, advice, or general conversation.

Provide a highly professional and motivating 'responseText' summarizing what action you took or what you are proposing. Ensure 'action' matches one of the defined categories.
Current Context (user viewing): ${sanitizeInput(currentContext || "dashboard", 100)}
Current System Time: ${currentTimeIso}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: cleanPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING },
            responseText: { type: Type.STRING },
            extractedData: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                deadline: { type: Type.STRING },
                estimatedMinutes: { type: Type.INTEGER },
                importance: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                focusRequirement: { type: Type.STRING },
                energyRequirement: { type: Type.STRING },
                riskLevel: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                project: { type: Type.STRING },
                duration: { type: Type.INTEGER },
                taskTitle: { type: Type.STRING },
                targetDay: { type: Type.STRING },
                subtasks: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          },
          required: ["action", "responseText"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    const action = sanitizeInput(parsed.action, 50) || "chat_response";
    const responseText = sanitizeInput(parsed.responseText, 500) || "Processed successfully.";
    const rawData = parsed.extractedData || {};

    // Standardize extracted fields
    const extractedData: any = { ...rawData };
    if (extractedData.title) extractedData.title = sanitizeInput(extractedData.title, 100);
    if (extractedData.description) extractedData.description = sanitizeInput(extractedData.description, 500);
    if (extractedData.deadline) extractedData.deadline = sanitizeInput(extractedData.deadline);
    if (extractedData.estimatedMinutes) extractedData.estimatedMinutes = Math.max(1, Number(extractedData.estimatedMinutes) || 45);
    if (extractedData.importance) {
      extractedData.importance = ["Low", "Medium", "High"].includes(extractedData.importance) ? extractedData.importance : "Medium";
    }
    if (extractedData.difficulty) {
      extractedData.difficulty = ["Easy", "Medium", "Hard"].includes(extractedData.difficulty) ? extractedData.difficulty : "Medium";
    }
    if (extractedData.focusRequirement) {
      extractedData.focusRequirement = ["Low Focus", "Medium Focus", "High Focus", "Deep Focus"].includes(extractedData.focusRequirement) ? extractedData.focusRequirement : "Medium Focus";
    }
    if (extractedData.energyRequirement) {
      extractedData.energyRequirement = ["Low", "Medium", "High"].includes(extractedData.energyRequirement) ? extractedData.energyRequirement : "Medium";
    }
    if (extractedData.riskLevel) {
      extractedData.riskLevel = ["Low", "Medium", "High", "Critical"].includes(extractedData.riskLevel) ? extractedData.riskLevel : "Low";
    }
    if (extractedData.tags) {
      extractedData.tags = Array.isArray(extractedData.tags) ? extractedData.tags.map((t: any) => sanitizeInput(t, 30)) : [];
    }
    if (extractedData.project) {
      extractedData.project = sanitizeInput(extractedData.project, 50) || "General";
    }

    res.json({ action, responseText, extractedData });
  } catch (error: any) {
    console.error("AI Command parse failed, executing offline fallback:", sanitizeError(error));
    const offlineResult = parseCommandOffline(req.body.prompt || "");
    res.json(offlineResult);
  }
});

// Run global prioritization on launch
triggerGlobalPrioritization();

// Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
