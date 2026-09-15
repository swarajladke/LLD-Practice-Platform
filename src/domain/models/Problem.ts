import type { ProblemRubric } from './Rubric.js';

/**
 * LLD Practice Problem entity.
 * Problem definitions and their rubrics are seeded externally, not hardcoded into logic.
 */
export interface Problem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly rubric: ProblemRubric;
}
