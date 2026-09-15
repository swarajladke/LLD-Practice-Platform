import type { Evidence } from './Evidence.js';
import type { RubricDimension } from './Rubric.js';

/**
 * Result for a single evaluated dimension.
 * Every dimension result MUST follow this exact shape.
 * Evidence is a strongly-typed value object referencing quotes from the submission.
 */
export interface DimensionResult {
  readonly criterion: RubricDimension;
  readonly score: number; // 0 to 5
  readonly evidence: Evidence; // Direct citation/quote from learner's submission
  readonly concern?: string;
  readonly suggestion: string;
  readonly confidence: number; // 0 to 1
  readonly evaluatorId: string; // Identifier of the evaluator
}
