import type { DimensionResult } from './DimensionResult.js';

/**
 * Complete evaluation report aggregating all evaluated dimensions.
 * Emitted with the same shape whether produced purely by deterministic checks,
 * LLM judgement, or a composite merge.
 */
export interface EvaluationReport {
  readonly attemptId: string;
  readonly dimensionResults: readonly DimensionResult[];
  readonly overallScore: number; // 0 to 5, computed from dimension weights
  readonly summary: string;
  readonly degraded: boolean; // True if evaluation ran with a fallback (e.g. LLM failed)
  readonly evaluatedAt: string; // ISO 8601 timestamp
}
