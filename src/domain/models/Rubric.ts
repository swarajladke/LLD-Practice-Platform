/**
 * 8 Standard Evaluation Rubric Dimensions.
 * Evaluations are rubric-based rather than reference-solution-based.
 */
export const RUBRIC_DIMENSIONS = [
  'requirementUnderstanding',
  'classResponsibilities',
  'couplingCohesion',
  'encapsulationInterfaces',
  'abstractionPatterns',
  'extensibility',
  'edgeCasesTestability',
  'explanationQuality',
] as const;

export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];

export interface ProblemRubric {
  readonly requirements: readonly string[];
  readonly clarifyingContext: readonly string[];
  readonly expectedConcepts: readonly string[];
  readonly extensionAxes: readonly string[];
  readonly minEntities: number;
  readonly minTradeoffs: number;
  readonly dimensionWeights: Readonly<Record<RubricDimension, number>>;
}
