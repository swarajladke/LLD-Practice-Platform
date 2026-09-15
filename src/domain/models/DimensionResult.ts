import type { EvidenceRef } from './Evidence.js';
import type { RubricDimension } from './Rubric.js';

/**
 * A concrete evaluation finding grounded by evidence or documented absence.
 * Includes evaluatorId so the UI and learner can distinguish rule-based vs AI findings.
 */
export interface Finding {
  readonly evidenceRef: EvidenceRef;
  readonly concern: string;
  readonly suggestion: string;
  readonly evaluatorId: string;
}

/**
 * Result for a single evaluated dimension.
 * Aggregates all detected findings rather than halting at the first violation.
 * Tracks all evaluators that contributed to this dimension.
 */
export interface DimensionResult {
  readonly criterion: RubricDimension;
  readonly findings: readonly Finding[];
  readonly score: number; // 0 to 5
  readonly confidence: number; // 0 to 1
  readonly evaluatorIds: readonly string[]; // All evaluators that contributed to this dimension
}

/**
 * Derives a normalized 0..5 score from heuristic findings.
 * - 0 findings = 5.0 (flawless)
 * - Each finding deducts a proportional penalty (default 1.5 points)
 * - Result is clamped to [0.0, 5.0] and rounded to 1 decimal place.
 */
export function deriveScoreFromFindings(
  findings: readonly Finding[],
  penaltyPerFinding: number = 1.5
): number {
  if (findings.length === 0) {
    return 5.0;
  }
  const rawScore = 5.0 - findings.length * penaltyPerFinding;
  const clamped = Math.max(0, Math.min(5, rawScore));
  return Math.round(clamped * 10) / 10;
}
