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

export interface RubricConfig {
  readonly rubricVersion: string;
  readonly expectedConcepts: readonly string[];
  readonly extensionAxes: readonly string[];
  readonly minEntities: number;
  readonly minTradeoffs: number;
  readonly dimensionWeights: Readonly<Record<RubricDimension, number>>;
}

export class Rubric implements RubricConfig {
  readonly rubricVersion: string;
  readonly expectedConcepts: readonly string[];
  readonly extensionAxes: readonly string[];
  readonly minEntities: number;
  readonly minTradeoffs: number;
  readonly dimensionWeights: Readonly<Record<RubricDimension, number>>;

  private constructor(config: RubricConfig) {
    this.rubricVersion = config.rubricVersion;
    this.expectedConcepts = Object.freeze([...config.expectedConcepts]);
    this.extensionAxes = Object.freeze([...config.extensionAxes]);
    this.minEntities = config.minEntities;
    this.minTradeoffs = config.minTradeoffs;
    this.dimensionWeights = Object.freeze({ ...config.dimensionWeights });
  }

  static create(config: RubricConfig): Rubric {
    if (!config.rubricVersion || config.rubricVersion.trim().length === 0) {
      throw new Error('Rubric version cannot be empty');
    }

    // Verify all 8 dimensions are present in dimensionWeights
    for (const dim of RUBRIC_DIMENSIONS) {
      if (typeof config.dimensionWeights[dim] !== 'number' || config.dimensionWeights[dim] < 0) {
        throw new Error(`Dimension weight for '${dim}' must be a non-negative number`);
      }
    }

    // Verify weights sum to 1 (with floating point tolerance 1e-5)
    const sum = Object.values(config.dimensionWeights).reduce((acc, w) => acc + w, 0);
    if (Math.abs(sum - 1.0) > 1e-5) {
      throw new Error(`Rubric dimension weights must sum to 1.0. Current sum: ${sum.toFixed(4)}`);
    }

    return new Rubric(config);
  }
}
