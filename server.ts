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
      priorityScore: 98,
      priorityLabel: "High",
      priorityReasoning: "Crucial for grade (carries 20%). You historically struggle with PyTorch setup, which takes extra time.",
      subtasks: [
        { id: "sub-1", text: "Collect Dataset (Scrape Kaggle for housing prices data)", done: true },
        { id: "sub-2", text: "Clean Data (Handle missing values and encode categorical variables)", done: true },
        { id: "sub-3", text: "Train Model (Implement Random Forest and tune hyperparameters)", done: false },
        { id: "sub-4", text: "Evaluate Model (Calculate RMSE and plot feature importance)", done: false },
        { id: "sub-5", text: "Build Presentation (Create slides summarizing methodology and results)", done: false }
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
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
      estimatedMinutes: 120,
      importance: "High",
      status: "pending",
      createdAt: new Date().toISOString(),
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
    console.error("Generate plan failed:", sanitizeError(error));
    res.status(500).json({ error: "Failed to generate plan suggestions. Please refine your prompt." });
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
