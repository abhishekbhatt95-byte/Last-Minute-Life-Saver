export interface CacheMetadata {
  generatedAt: number;
  expiresAt: number;
  contextVersion: string;
  promptVersion: string;
  aiModel: string;
  source: string;
}

export interface CacheEntry<T> {
  fingerprint: string;
  data: T;
  metadata: CacheMetadata;
}

export interface DecisionTrace {
  id: string;
  timestamp: number;
  contextVersion: string;
  promptVersion: string;
  source: "ai" | "cached" | "local";
  cacheHit: boolean;
  llmLatency: number; // in ms
  validatorResult: boolean;
  fallbackUsage: boolean;
}

// In-memory version counters for lightweight fingerprinting and instant invalidation
export const versionState = {
  tasksVersion: 1,
  calendarVersion: 1,
  focusVersion: 1,
  preferencesVersion: 1,
  memoryVersion: 1,
};

/**
 * Computes a unified composite context version string based on version state counters.
 */
export function getCompositeContextVersion(): string {
  return `tasks:${versionState.tasksVersion}|cal:${versionState.calendarVersion}|focus:${versionState.focusVersion}|pref:${versionState.preferencesVersion}|mem:${versionState.memoryVersion}`;
}

/**
 * Computes a lightweight context fingerprint composed of version counters and a 5-minute time bucket.
 */
export function getContextFingerprint(): string {
  const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-minute bucket
  return `t${versionState.tasksVersion}_c${versionState.calendarVersion}_f${versionState.focusVersion}_p${versionState.preferencesVersion}_m${versionState.memoryVersion}_tb${timeBucket}`;
}

/**
 * Dedicated utility to invalidate specific recommendation cache slices.
 */
export function invalidateRecommendationCache(type: "tasks" | "calendar" | "focus" | "preferences" | "memory" | "all") {
  if (type === "all") {
    versionState.tasksVersion++;
    versionState.calendarVersion++;
    versionState.focusVersion++;
    versionState.preferencesVersion++;
    versionState.memoryVersion++;
  } else {
    versionState[`${type}Version`]++;
  }
  console.log(`[CACHE INVALIDATION] Cache invalidated for slice: "${type}". Current composite version: ${getCompositeContextVersion()}`);
}

class DecisionTraceStore {
  private traces: DecisionTrace[] = [];

  addTrace(trace: DecisionTrace): void {
    this.traces.unshift(trace);
    if (this.traces.length > 100) {
      this.traces.pop();
    }
    console.log(`[DECISION TRACE] Recorded: ID="${trace.id}", Source="${trace.source}", CacheHit=${trace.cacheHit}, Latency=${trace.llmLatency}ms, Fallback=${trace.fallbackUsage}, ContextVer="${trace.contextVersion}", PromptVer="${trace.promptVersion}"`);
  }

  getTraces(): DecisionTrace[] {
    return [...this.traces];
  }

  clear(): void {
    this.traces = [];
  }
}

export const decisionTraceStore = new DecisionTraceStore();

class RecommendationCache {
  private cacheStore = new Map<string, CacheEntry<any>>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private defaultTtlMs = 5 * 60 * 1000; // 5 minutes expiration
  private staleTtlMs = 2 * 60 * 1000;   // 2 minutes slightly stale threshold for SWR

  /**
   * Retrieves a cached recommendation if fingerprint, promptVersion, and contextVersion are valid.
   * Leverages stale-while-revalidate if the cache is slightly stale.
   */
  get<T>(
    key: string,
    currentFingerprint: string,
    expectedPromptVersion: string,
    expectedContextVersion: string,
    revalidateCallback?: () => Promise<any>
  ): T | null {
    const entry = this.cacheStore.get(key);
    
    if (!entry) {
      console.log(`[CACHE MISS] No cache entry found for key: "${key}"`);
      return null;
    }

    // 1. Validate fingerprint (implicitly contains time-bucket & all versions)
    if (entry.fingerprint !== currentFingerprint) {
      console.log(`[CACHE INVALID] Fingerprint mismatch for key "${key}". Evicting entry.`);
      this.cacheStore.delete(key);
      return null;
    }

    // 2. Validate promptVersion
    if (entry.metadata.promptVersion !== expectedPromptVersion) {
      console.log(`[CACHE INVALID] Prompt version mismatch for key "${key}". Expected: "${expectedPromptVersion}", Cached: "${entry.metadata.promptVersion}". Evicting entry.`);
      this.cacheStore.delete(key);
      return null;
    }

    // 3. Validate contextVersion
    if (entry.metadata.contextVersion !== expectedContextVersion) {
      console.log(`[CACHE INVALID] Context version mismatch for key "${key}". Expected: "${expectedContextVersion}", Cached: "${entry.metadata.contextVersion}". Evicting entry.`);
      this.cacheStore.delete(key);
      return null;
    }

    const now = Date.now();
    
    // 4. Stale-While-Revalidate check
    if (now > entry.metadata.expiresAt) {
      const isSlightlyStale = now <= entry.metadata.expiresAt + this.staleTtlMs;
      if (isSlightlyStale) {
        console.log(`[CACHE SWR HIT] Key "${key}" is slightly stale (within 2m SWR window). Returning cached recommendation immediately & triggering revalidation.`);
        if (revalidateCallback) {
          this.triggerRevalidation(key, revalidateCallback);
        }
        return entry.data;
      } else {
        console.log(`[CACHE EXPIRED] Key "${key}" is completely expired. Evicting.`);
        this.cacheStore.delete(key);
        return null;
      }
    }

    console.log(`[CACHE FRESH HIT] Cache hit for key: "${key}".`);
    return entry.data;
  }

  /**
   * Safe revalidation / generation trigger with stampede protection (coalescing)
   */
  triggerRevalidation(key: string, callback: () => Promise<any>): void {
    if (this.inFlightRequests.has(key)) {
      console.log(`[STAMPEDE PREVENTED] An in-flight request is already active for key: "${key}". Coalescing.`);
      return;
    }

    const promise = (async () => {
      try {
        await callback();
      } catch (err) {
        console.error(`[STAMPEDE RUNNER ERROR] Error running in-flight request for key "${key}":`, err);
        throw err;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
  }

  /**
   * Run a generation function through the stampede protector.
   */
  async runCoalesced<T>(key: string, generateFn: () => Promise<T>): Promise<T> {
    const active = this.inFlightRequests.get(key);
    if (active) {
      console.log(`[CACHE STAMPEDE PREVENTED] Reusing in-flight generation Promise for key: "${key}"`);
      return active;
    }

    const promise = (async () => {
      try {
        return await generateFn();
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  /**
   * Stores a recommendation in the cache.
   */
  set<T>(
    key: string,
    fingerprint: string,
    data: T,
    metadataInput: {
      contextVersion: string;
      promptVersion: string;
      aiModel: string;
    },
    ttlMs = this.defaultTtlMs
  ): void {
    const now = Date.now();
    const metadata: CacheMetadata = {
      generatedAt: now,
      expiresAt: now + ttlMs,
      contextVersion: metadataInput.contextVersion,
      promptVersion: metadataInput.promptVersion,
      aiModel: metadataInput.aiModel,
      source: key,
    };

    this.cacheStore.set(key, {
      fingerprint,
      data,
      metadata,
    });
    console.log(`[CACHE SET] Cached recommendation for key: "${key}". Expires in ${ttlMs / 1000}s. Metadata:`, metadata);
  }

  /**
   * Clears the entire cache store
   */
  clear(): void {
    this.cacheStore.clear();
    this.inFlightRequests.clear();
    console.log("[CACHE CLEAR] Cleared all cached recommendations & active in-flight tracking.");
  }
}

export const recommendationCache = new RecommendationCache();
