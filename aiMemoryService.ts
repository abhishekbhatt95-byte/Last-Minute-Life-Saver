import { invalidateRecommendationCache } from "./recommendationCache";

class AIMemoryService {
  private memory: string[] = [
    "User historically struggles with starting large academic tasks (particularly ML setup).",
    "User maintains excellent focus during 25-minute pomodoro sprints compared to longer open blocks.",
    "Afternoons (2 PM - 4 PM) show a slight dip in focus efficacy."
  ];

  private recentRecommendations: string[] = [
    "Suggested scheduling deep-focus sessions earlier in the day to leverage peak cognitive energy.",
    "Recommended breaking down 'ML Assignment' into smaller subtasks to reduce starting friction."
  ];

  /**
   * Retrieves the current AI Memory array
   */
  getMemory(): string[] {
    return [...this.memory];
  }

  /**
   * Appends an observation to the AI memory if it's not a duplicate.
   * Invalidates recommendation cache when memory updates.
   */
  addMemoryItem(item: string): void {
    if (!item || item.trim() === "") return;
    
    const normalizedItem = item.trim();
    if (!this.memory.includes(normalizedItem)) {
      this.memory.push(normalizedItem);
      console.log(`[AI MEMORY] Added observation: "${normalizedItem}"`);
      invalidateRecommendationCache("memory");
    }
  }

  /**
   * Retrieves the recent AI Recommendations
   */
  getRecommendations(): string[] {
    return [...this.recentRecommendations];
  }

  /**
   * Adds an AI recommendation log entry.
   */
  addRecommendation(rec: string): void {
    if (!rec || rec.trim() === "") return;
    this.recentRecommendations.unshift(rec.trim());
    if (this.recentRecommendations.length > 5) {
      this.recentRecommendations.pop();
    }
    // Note: Logging a recommendation doesn't necessarily invalidate the cache immediately,
    // but if needed, we can call invalidateRecommendationCache("preferences") or keep it light.
  }

  /**
   * Resets the AI Memory and Recommendations store to defaults
   */
  reset(): void {
    this.memory = [];
    this.recentRecommendations = [];
    invalidateRecommendationCache("memory");
  }
}

export const aiMemoryService = new AIMemoryService();
