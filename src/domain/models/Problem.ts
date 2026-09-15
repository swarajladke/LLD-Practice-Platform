import type { Rubric } from './Rubric.js';

/**
 * LLD Practice Problem entity.
 * Problem content (requirements, clarifyingContext) lives on Problem.
 * Evaluation rubric configuration lives on Rubric.
 */
export interface Problem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requirements: readonly string[];
  readonly clarifyingContext: readonly string[];
  readonly rubric: Rubric;
}
