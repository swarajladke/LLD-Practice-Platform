import type { DesignSpec } from '../models/DesignSpec.js';
import type { DimensionResult } from '../models/DimensionResult.js';
import type { Problem } from '../models/Problem.js';
import type { ProblemRubric } from '../models/Rubric.js';

export interface EvaluationContext {
  readonly attemptId: string;
  readonly spec: DesignSpec;
  readonly problem: Problem;
  readonly rubric: ProblemRubric;
}

/**
 * Strategy interface for evaluation engines.
 * Answers Change Test B:
 * Evaluators can be deterministic rule engines, LLM evaluators, or human reviewers.
 * Any new evaluator implements this interface and is registered into CompositeEvaluator
 * without modifying existing evaluators or the practice flow.
 */
export interface Evaluator {
  readonly id: string;
  supports(spec: DesignSpec): boolean;
  evaluate(ctx: EvaluationContext): Promise<readonly DimensionResult[]>;
}
