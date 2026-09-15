import type { DesignSpec } from '../models/DesignSpec.js';
import type { DimensionResult } from '../models/DimensionResult.js';
import type { Problem } from '../models/Problem.js';
import type { Rubric } from '../models/Rubric.js';

export interface EvaluationContext {
  readonly attemptId: string;
  readonly spec: DesignSpec;
  readonly problem: Problem;
  readonly rubric: Rubric;
}

/**
 * Strategy interface for evaluation engines.
 * Evaluators accept the EvaluationContext to decide support and execute evaluation.
 */
export interface Evaluator {
  readonly id: string;
  supports(ctx: EvaluationContext): boolean;
  evaluate(ctx: EvaluationContext): Promise<readonly DimensionResult[]>;
}
