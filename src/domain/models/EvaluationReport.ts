import type { DimensionResult } from './DimensionResult.js';
import type { RubricDimension } from './Rubric.js';

export interface EvaluatorProvenance {
  readonly evaluatorsRun: readonly string[];
  readonly evaluatorsFailed: readonly string[];
  readonly evaluatorsSkipped: readonly string[];
}

/**
 * Complete evaluation report aggregating all evaluated dimensions.
 * Stamped with rubricVersion, evaluator provenance, and completeness indicators.
 */
export interface EvaluationReport {
  readonly attemptId: string;
  readonly rubricVersion: string;
  readonly evaluatorsRun: readonly string[];
  readonly evaluatorsFailed: readonly string[];
  readonly evaluatorsSkipped: readonly string[];
  readonly dimensionsMissing: readonly RubricDimension[];
  readonly overallScoreComparable: boolean;
  readonly dimensionResults: readonly DimensionResult[];
  readonly overallScore: number; // 0 to 5, computed from dimension weights
  readonly summary: string;
  readonly degraded: boolean; // True if evaluation ran with a fallback or skipped evaluator
  readonly evaluatedAt: string; // ISO 8601 timestamp
}
