import type { RubricDimension } from './Rubric.js';

/**
 * Result for a single evaluated dimension.
 * Every dimension result MUST follow this exact shape.
 * A dimension result without cited evidence from the learner's submission is invalid.
 */
export interface DimensionResult {
  readonly criterion: RubricDimension;
  readonly score: number; // 0 to 5
  readonly evidence: string; // Direct citation/quote from learner's submission (cannot be empty)
  readonly concern?: string;
  readonly suggestion: string;
  readonly confidence: number; // 0 to 1
  readonly evaluatorId: string; // Identifier of the evaluator that produced or merged this result
}
