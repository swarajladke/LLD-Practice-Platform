import type { DesignSpec } from '../models/DesignSpec.js';
import type { DimensionResult } from '../models/DimensionResult.js';
import type { Problem } from '../models/Problem.js';
import type { Rubric } from '../models/Rubric.js';
import type { EvaluatorProvenance } from '../models/EvaluationReport.js';

export interface EvaluationContext {
  readonly attemptId: string;
  readonly spec: DesignSpec;
  readonly problem: Problem;
  readonly rubric: Rubric;
}

export interface CompositeEvaluationResult {
  readonly results: readonly DimensionResult[];
  readonly provenance: EvaluatorProvenance;
}

/**
 * Strategy interface for evaluation engines.
 * Leaf evaluators return readonly DimensionResult[].
 */
export interface Evaluator {
  readonly id: string;
  supports(ctx: EvaluationContext): boolean;
  evaluate(ctx: EvaluationContext): Promise<readonly DimensionResult[]>;
}

