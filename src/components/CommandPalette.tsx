import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Task } from "../types";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  activeTab: string;
  setActiveTab: (tab: "dashboard" | "schedule" | "tasks" | "planner" | "analytics" | "settings") => void;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setSelectedTask: (task: Task | null) => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
  triggerPrioritize: () => void;
  setFocusTimeTotal: (seconds: number) => void;
  setFocusTimeLeft: (seconds: number) => void;
  setFocusIsRunning: (running: boolean) => void;
  setFocusTimerTask: (task: Task | null) => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  tasks,
  activeTab,
  setActiveTab,
  setTasks,
  setSelectedTask,
  showToast,
  triggerPrioritize,
  setFocusTimeTotal,
  setFocusTimeLeft,
  setFocusIsRunning,
  setFocusTimerTask
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResponse(null);
      setResult(null);
    }
  }, [isOpen]);

  const handleExecute = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    setLoading(true);
    setResponse(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          currentContext: activeTab
        })
      });

      if (!res.ok) {
        throw new Error("Failed to execute command.");
      }

      const data = await res.json();
      setResponse(data.responseText);
      setResult(data);

      // Instantly trigger certain actions
      if (data.action === "start_focus_session") {
        const duration = data.extractedData?.duration || 25;
        // Associate with a task if possible
        const matchedTask = tasks.find(t => 
          t.title.toLowerCase().includes((data.extractedData?.taskTitle || "").toLowerCase()) ||
          (data.extractedData?.taskTitle || "").toLowerCase().includes(t.title.toLowerCase())
        );
        
        setFocusTimeTotal(duration * 60);
        setFocusTimeLeft(duration * 60);
        setFocusIsRunning(true);
        if (matchedTask) {
          setFocusTimerTask(matchedTask);
        }
        showToast(`⏱️ Started a ${duration}-minute focus session!`, "success");
        setTimeout(() => onClose(), 1800);
      } else if (data.action === "plan_day") {
        setActiveTab("planner");
        setSelectedTask(null);
        setTimeout(() => onClose(), 1800);
      } else if (data.action === "show_overdue") {
        setActiveTab("tasks");
        setSelectedTask(null);
        showToast("📅 Switched to Tasks to review overdue items.", "info");
        setTimeout(() => onClose(), 1800);
      } else if (data.action === "generate_weekly_schedule") {
        setActiveTab("schedule");
        setSelectedTask(null);
        setTimeout(() => onClose(), 1800);
      }
    } catch (err: any) {
      showToast(err.message || "Command palette execution failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCreateTask = async () => {
    if (!result || !result.extractedData) return;
    const taskData = result.extractedData;

    setLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskData.title,
          description: taskData.description || "Created via Life Saver Global Command Palette",
          deadline: taskData.deadline || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          estimatedMinutes: taskData.estimatedMinutes || 45,
          importance: taskData.importance || "Medium",
          difficulty: taskData.difficulty || "Medium",
          focusRequirement: taskData.focusRequirement || "Medium Focus",
          energyRequirement: taskData.energyRequirement || "Medium",
          riskLevel: taskData.riskLevel || "Low",
          tags: taskData.tags || ["command-palette"],
          project: taskData.project || "General",
          progress: 0
        })
      });

      if (!res.ok) {
        throw new Error("Failed to create task.");
      }

      const created = await res.json();
      setTasks(prev => [...prev, created]);
      showToast(`🎉 Task "${created.title}" successfully created!`, "success");
      triggerPrioritize();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Failed to create task.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Predefined quick command clicks
  const quickActions = [
    { label: "Plan my day", icon: "psychology", prompt: "Plan my day and optimize task schedules" },
    { label: "Start 25m Focus Block", icon: "timer", prompt: "Start focus session for 25 minutes" },
    { label: "Start 90m Deep Focus", icon: "bolt", prompt: "Start focus session for 90 minutes" },
    { label: "Find overdue items", icon: "event_busy", prompt: "Show my overdue tasks" },
    { label: "Audit current workload", icon: "analytics", prompt: "Summarize my today progress and performance insights" }
  ];

  const templates = [
    "Create task study ML assignment before next Friday at 5pm with high priority",
    "Create task prep panel internship interview duration 120 minutes tomorrow",
    "How can I better manage my high priority workload today?"
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-10 pt-20 sm:pt-32 bg-black/75 backdrop-blur-md">
      {/* Clicking backdrop closes command palette */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      <motion.div
        initial={{ scale: 0.97, opacity: 0, y: -10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: -10 }}
        className="glass-panel-heavy glow-border rounded-2xl w-full max-w-2xl overflow-hidden relative flex flex-col max-h-[80vh] shadow-2xl shadow-black/80"
      >
        {/* Search Input Area */}
        <div className="relative flex items-center border-b border-white/10 px-4 py-3 bg-[#13141a]/90">
          <span className="material-symbols-outlined text-[#c7c4d7]/70 mr-3 text-[22px]">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleExecute(query);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Type a command or ask AI anything... (e.g., 'Create task clean up room tomorrow')"
            className="w-full bg-transparent border-none text-white placeholder-[#c7c4d7]/50 text-sm focus:outline-none focus:ring-0 py-1"
            disabled={loading}
          />
          <div className="flex items-center gap-1">
            {query.trim() && !loading && (
              <button
                onClick={() => handleExecute(query)}
                className="bg-[#c0c1ff]/10 hover:bg-[#c0c1ff]/20 text-[#c0c1ff] text-[10px] font-mono px-2 py-1 rounded border border-[#c0c1ff]/20 transition-all cursor-pointer mr-1"
              >
                ↵ Enter
              </button>
            )}
            <kbd className="hidden sm:inline-block bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[9px] font-mono text-[#c7c4d7]/70">
              ESC
            </kbd>
          </div>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-5 space-y-6 max-h-[55vh] scrollbar-thin bg-[#15161c]/40">
          {/* Loading state */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="relative flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-[#c0c1ff] animate-spin-slow">auto_awesome</span>
                <span className="absolute inset-0 bg-[#c0c1ff]/10 blur-xl rounded-full"></span>
              </div>
              <div className="text-center">
                <h4 className="font-sans font-bold text-sm text-white animate-pulse">Analyzing command context...</h4>
                <p className="font-mono text-[10px] text-[#c7c4d7]/60 mt-1 uppercase tracking-widest">Optimizing productivity vectors</p>
              </div>
            </div>
          )}

          {/* Result view */}
          {!loading && response && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <span className="material-symbols-outlined text-[#c0c1ff] text-[18px]">psychology</span>
                <span className="font-mono text-[10px] text-[#c0c1ff] uppercase tracking-widest font-semibold">AI Assistant Response</span>
              </div>
              
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-xs text-[#e2e2eb] leading-relaxed whitespace-pre-wrap font-sans">
                {response}
              </div>

              {/* Specific interactive actions */}
              {result && result.action === "create_task" && result.extractedData && (
                <div className="p-4 rounded-xl bg-[#c0c1ff]/5 border border-[#c0c1ff]/20 space-y-3">
                  <div className="flex items-center gap-1.5 text-[#c0c1ff] font-mono text-[10px] uppercase tracking-wider font-bold">
                    <span className="material-symbols-outlined text-[16px]">add_task</span>
                    Confirm Detected Task Details
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#13141a]/40 p-3 rounded-lg border border-white/5">
                    <div>
                      <span className="text-[10px] font-mono text-[#c7c4d7]/60 block uppercase">Title</span>
                      <span className="font-semibold text-white">{result.extractedData.title}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-[#c7c4d7]/60 block uppercase">Deadline</span>
                      <span className="text-white">
                        {result.extractedData.deadline 
                          ? new Date(result.extractedData.deadline).toLocaleString() 
                          : "Tomorrow"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-[#c7c4d7]/60 block uppercase">Est. Duration</span>
                      <span className="text-white">{result.extractedData.estimatedMinutes || 45} minutes</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-[#c7c4d7]/60 block uppercase">Importance</span>
                      <span className="text-white font-semibold">{result.extractedData.importance || "Medium"}</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3.5 pt-1">
                    <button
                      onClick={() => {
                        setResponse(null);
                        setResult(null);
                      }}
                      className="px-3.5 py-1.5 bg-transparent hover:bg-white/5 rounded-lg text-xs font-semibold text-[#c7c4d7] cursor-pointer"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={handleConfirmCreateTask}
                      className="px-4 py-1.5 bg-[#c0c1ff] hover:bg-[#c0c1ff]/90 text-[#1000a9] font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Confirm and Create Task
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    setQuery("");
                    setResponse(null);
                    setResult(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#c7c4d7] hover:text-white transition-colors text-xs font-mono font-medium cursor-pointer"
                >
                  ← Try Another Command
                </button>
              </div>
            </div>
          )}

          {/* Default list view (when no command executed yet) */}
          {!loading && !response && (
            <div className="space-y-5 animate-fade-in">
              {/* Quick Suggestion Chips */}
              <div className="space-y-2">
                <h4 className="font-mono text-[9px] uppercase tracking-widest text-[#c7c4d7]/60">Instant Operations</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickActions.map((act, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQuery(act.prompt);
                        handleExecute(act.prompt);
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-[#1a1b22]/30 hover:bg-[#c0c1ff]/10 hover:border-[#c0c1ff]/20 transition-all text-left group cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[#c7c4d7]/80 group-hover:text-[#c0c1ff] transition-colors text-[18px]">
                        {act.icon}
                      </span>
                      <span className="text-xs font-semibold text-[#e2e2eb] group-hover:text-white transition-colors">
                        {act.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Natural Language Templates */}
              <div className="space-y-2">
                <h4 className="font-mono text-[9px] uppercase tracking-widest text-[#c7c4d7]/60">Natural Language Templates</h4>
                <div className="space-y-1.5">
                  {templates.map((tmpl, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQuery(tmpl);
                        inputRef.current?.focus();
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-[#13141a]/20 hover:bg-white/5 text-left text-xs text-[#c7c4d7] hover:text-white font-mono cursor-pointer transition-colors"
                    >
                      <span className="truncate pr-4">"{tmpl}"</span>
                      <span className="material-symbols-outlined text-[14px] text-[#c7c4d7]/30 shrink-0">edit</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer info badge */}
        <div className="border-t border-white/5 px-5 py-3 bg-[#13141a]/90 flex items-center justify-between text-[10px] font-mono text-[#c7c4d7]/50">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px] text-[#c0c1ff] animate-pulse">auto_awesome</span>
            AI Command Center Enabled
          </span>
          <span>Use ⌘K or Ctrl+K to toggle anywhere</span>
        </div>
      </motion.div>
    </div>
  );
}
