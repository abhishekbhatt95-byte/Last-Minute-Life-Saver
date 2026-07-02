import { FocusSession } from "./types";

export interface FocusScoringResult {
  score: number | null;
  sessionsAnalyzed: number;
  completionRate: number | null;
  durationAccuracy: number | null;
  consistency: number | null;
  interruptions: number | null;
  confidence: "Low" | "Medium" | "High";
  trend: "up" | "down" | "stable" | "new";
  rawCompletionRate: number;
  rawDurationAccuracy: number | null;
  rawConsistencyDays: number;
  rawInterruptions: number;
}

const MIN_SESSION_DURATION_MINUTES = 1.0;

// Calculate focus efficacy score for a list of sessions over a specific time range
export function calculateFocusEfficacyForRange(
  allSessions: FocusSession[],
  nowTimestamp: number,
  startDaysAgo: number,
  endDaysAgo: number
): {
  score: number | null;
  sessionsAnalyzed: number;
  completionRate: number | null;
  durationAccuracy: number | null;
  consistency: number | null;
  interruptions: number | null;
  confidence: "Low" | "Medium" | "High";
  rawCompletionRate: number;
  rawDurationAccuracy: number | null;
  rawConsistencyDays: number;
  rawInterruptions: number;
} {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const startMs = nowTimestamp - endDaysAgo * oneDayMs;
  const endMs = nowTimestamp - startDaysAgo * oneDayMs;

  // 1. Filter sessions in range, excluding accidental sessions (noise floor)
  const rangeSessions = allSessions.filter((s) => {
    const startedTime = new Date(s.startedAt).getTime();
    const isInRange = startedTime >= startMs && startedTime < endMs;
    const isAboveNoiseFloor = s.actualDurationMinutes >= MIN_SESSION_DURATION_MINUTES;
    return isInRange && isAboveNoiseFloor;
  });

  const sessionsAnalyzed = rangeSessions.length;

  // Count unique days with any valid session
  const uniqueDaysWithAnySession = new Set(
    rangeSessions.map((s) => new Date(s.startedAt).toLocaleDateString())
  ).size;

  // 2. Cold start check
  if (sessionsAnalyzed === 0) {
    return {
      score: null,
      sessionsAnalyzed: 0,
      completionRate: null,
      durationAccuracy: null,
      consistency: null,
      interruptions: null,
      confidence: "Low",
      rawCompletionRate: 0,
      rawDurationAccuracy: null,
      rawConsistencyDays: 0,
      rawInterruptions: 0,
    };
  }

  let totalWeight = 0;
  let completionPointsSum = 0;
  let durationAccuracyPointsSum = 0;
  let durationAccuracyWeightSum = 0;
  let interruptionScoreSum = 0;

  // Track raw (unweighted) metrics for statistics
  let rawCompletionPoints = 0;
  let rawDurationAccuracyTotal = 0;
  let rawDurationAccuracyCount = 0;
  let rawInterruptionScoreTotal = 0;

  // Unique days tracking for consistency (using local date string)
  const meaningfulDaysMap = new Map<string, number>(); // dateStr -> minDaysAgo

  rangeSessions.forEach((s) => {
    const startedTime = new Date(s.startedAt).getTime();
    const daysAgo = (nowTimestamp - startedTime) / oneDayMs;
    const weight = Math.exp(-daysAgo / 4);

    totalWeight += weight;

    // --- 1. Completion Rate points (Dynamic Recovery Deferred to v2) ---
    let compPoints = 0;
    if (s.outcome === "completed" || s.outcome === "overrun") {
      compPoints = 1.0;
    } else if (s.outcome === "cancelled") {
      compPoints = 0.5;
    } else if (s.outcome === "abandoned") {
      compPoints = 0.0;
    }
    completionPointsSum += compPoints * weight;
    rawCompletionPoints += compPoints;

    // --- 2. Duration Accuracy (Completed and Overrun sessions only) ---
    if (s.outcome === "completed" || s.outcome === "overrun") {
      const toleratedOverrun = Math.min(0.1 * s.plannedDurationMinutes, 5);
      let accuracy = 0;
      if (s.actualDurationMinutes <= s.plannedDurationMinutes + toleratedOverrun) {
        accuracy = 100;
      } else {
        const excessStart = s.plannedDurationMinutes + toleratedOverrun;
        const excessMax = 1.5 * s.plannedDurationMinutes;
        if (s.actualDurationMinutes >= excessMax) {
          accuracy = 0;
        } else {
          accuracy = 100 * (1 - (s.actualDurationMinutes - excessStart) / (excessMax - excessStart));
        }
      }
      durationAccuracyPointsSum += accuracy * weight;
      durationAccuracyWeightSum += weight;
      rawDurationAccuracyTotal += accuracy;
      rawDurationAccuracyCount++;
    }

    // --- 3. Interruption Quality ---
    const pauseTimePenalty = Math.min(30, s.totalPausedMinutes * 5);
    const interruptionScore = Math.max(
      0,
      100 - s.interruptionCount * 15 - s.pauseCount * 10 - pauseTimePenalty
    );
    interruptionScoreSum += interruptionScore * weight;
    rawInterruptionScoreTotal += interruptionScore;

    // --- 4. Focus Consistency ---
    const isMeaningful = s.actualDurationMinutes >= 0.5 * s.plannedDurationMinutes;
    if (isMeaningful) {
      const localDateStr = new Date(s.startedAt).toLocaleDateString();
      const currentMinDaysAgo = meaningfulDaysMap.get(localDateStr);
      if (currentMinDaysAgo === undefined || daysAgo < currentMinDaysAgo) {
        meaningfulDaysMap.set(localDateStr, daysAgo);
      }
    }
  });

  // Calculate Weighted Component Scores
  const completionRate = (completionPointsSum / totalWeight) * 100;
  const interruptions = interruptionScoreSum / totalWeight;

  // Consistency calculation based on day weights
  let uniqueDaysWeightSum = 0;
  meaningfulDaysMap.forEach((daysAgo) => {
    uniqueDaysWeightSum += Math.exp(-daysAgo / 4);
  });
  // 2.5 target translates to a perfect consistency goal (roughly 5 working days with decay)
  const consistency = Math.min(100, (uniqueDaysWeightSum / 2.5) * 100);

  // Dynamic component weighting based on eligibility (exclude and redistribute, never fabricate)
  let compWeight = 0.4;
  let durWeight = 0.3;
  let consWeight = 0.2;
  let intWeight = 0.1;

  const isDurationAccuracyEligible = durationAccuracyWeightSum > 0;
  const durationAccuracy = isDurationAccuracyEligible
    ? durationAccuracyPointsSum / durationAccuracyWeightSum
    : null;

  if (!isDurationAccuracyEligible) {
    durWeight = 0;
  }

  const totalActiveWeight = compWeight + durWeight + consWeight + intWeight;
  let score = 0;

  if (totalActiveWeight > 0) {
    const scaledCompWeight = compWeight / totalActiveWeight;
    const scaledDurWeight = durWeight / totalActiveWeight;
    const scaledConsWeight = consWeight / totalActiveWeight;
    const scaledIntWeight = intWeight / totalActiveWeight;

    const durVal = durationAccuracy !== null ? durationAccuracy : 0;

    score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          scaledCompWeight * completionRate +
            scaledDurWeight * durVal +
            scaledConsWeight * consistency +
            scaledIntWeight * interruptions
        )
      )
    );
  }

  // Confidence level determination
  let confidence: "Low" | "Medium" | "High" = "Low";
  if (sessionsAnalyzed >= 3 && uniqueDaysWithAnySession >= 3) {
    if (sessionsAnalyzed >= 8) {
      confidence = "High";
    } else {
      confidence = "Medium";
    }
  }

  return {
    score,
    sessionsAnalyzed,
    completionRate,
    durationAccuracy,
    consistency,
    interruptions,
    confidence,
    rawCompletionRate: Math.round((rawCompletionPoints / sessionsAnalyzed) * 100),
    rawDurationAccuracy: isDurationAccuracyEligible
      ? Math.round(rawDurationAccuracyTotal / rawDurationAccuracyCount)
      : null,
    rawConsistencyDays: meaningfulDaysMap.size,
    rawInterruptions: Math.round(rawInterruptionScoreTotal / sessionsAnalyzed),
  };
}

// Main function to compute the complete score and trend analysis
export function calculateFocusEfficacy(
  allSessions: FocusSession[]
): FocusScoringResult {
  const nowTimestamp = Date.now();

  // Current last 7 days (0 to 7 days ago)
  const currentResult = calculateFocusEfficacyForRange(allSessions, nowTimestamp, 0, 7);

  if (currentResult.score === null) {
    return {
      score: null,
      sessionsAnalyzed: 0,
      completionRate: null,
      durationAccuracy: null,
      consistency: null,
      interruptions: null,
      confidence: "Low",
      trend: "new",
      rawCompletionRate: 0,
      rawDurationAccuracy: null,
      rawConsistencyDays: 0,
      rawInterruptions: 0,
    };
  }

  // Previous 7 days (7 to 14 days ago) for Trend Indicator
  const previousResult = calculateFocusEfficacyForRange(allSessions, nowTimestamp, 7, 14);

  let trend: "up" | "down" | "stable" | "new" = "new";
  if (previousResult.score !== null) {
    const diff = currentResult.score - previousResult.score;
    if (diff > 2) {
      trend = "up";
    } else if (diff < -2) {
      trend = "down";
    } else {
      trend = "stable";
    }
  }

  return {
    ...currentResult,
    trend,
  };
}
