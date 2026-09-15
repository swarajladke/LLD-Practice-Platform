import type { Attempt } from './Attempt.js';
import type { RubricDimension } from './Rubric.js';

/**
 * Score progression between attempts for a given dimension.
 */
export interface DimensionDelta {
  readonly criterion: RubricDimension;
  readonly previousScore: number;
  readonly currentScore: number;
  readonly delta: number; // currentScore - previousScore
}

/**
 * Attempt decorated with deltas relative to the immediately preceding evaluated attempt.
 */
export interface AttemptWithDeltas {
  readonly attempt: Attempt;
  readonly deltas?: readonly DimensionDelta[];
}

/**
 * An identified recurring architectural weakness across multiple attempts.
 */
export interface RecurringWeakness {
  readonly criterion: RubricDimension;
  readonly averageScore: number;
  readonly lowScoreCount: number; // Number of times scored below threshold (e.g. <= 2.5)
  readonly recurringConcerns: readonly string[];
  readonly recommendedFocus: string;
}

/**
 * Overall learning loop summary aggregating weakness patterns across a learner's history.
 */
export interface LearnerWeaknessSummary {
  readonly learnerId: string;
  readonly totalEvaluatedAttempts: number;
  readonly recurringWeaknesses: readonly RecurringWeakness[];
}
