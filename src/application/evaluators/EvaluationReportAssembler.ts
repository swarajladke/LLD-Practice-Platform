import type { DimensionResult } from '../../domain/models/DimensionResult.js';
import type { EvaluationReport, EvaluatorProvenance } from '../../domain/models/EvaluationReport.js';
import { RUBRIC_DIMENSIONS, type Rubric, type RubricDimension } from '../../domain/models/Rubric.js';
import { type Clock, defaultClock } from '../../domain/services/Clock.js';

export interface AssembleReportParams {
  readonly attemptId: string;
  readonly rubric: Rubric;
  readonly results: readonly DimensionResult[];
  readonly provenance: EvaluatorProvenance;
}

/**
 * Pure application service responsible for assembling canonical EvaluationReports.
 * Decoupled from evaluator execution engines, with injectable Clock.
 */
export class EvaluationReportAssembler {
  constructor(private readonly clock: Clock = defaultClock) {}

  assemble(params: AssembleReportParams): EvaluationReport {
    const { attemptId, rubric, results, provenance } = params;

    // Determine missing dimensions against problem rubric
    const evaluatedDimensions = new Set<RubricDimension>(results.map((r) => r.criterion));
    const dimensionsMissing: RubricDimension[] = RUBRIC_DIMENSIONS.filter(
      (dim) => !evaluatedDimensions.has(dim)
    );

    const overallScoreComparable = dimensionsMissing.length === 0;

    // degraded is true whenever any evaluator failed or was skipped
    const degraded =
      provenance.evaluatorsFailed.length > 0 || provenance.evaluatorsSkipped.length > 0;

    // Calculate weighted overall score
    let totalAssignedWeight = 0;
    let weightedScoreTotal = 0;

    for (const res of results) {
      const weight = rubric.dimensionWeights[res.criterion] ?? 0;
      totalAssignedWeight += weight;
      weightedScoreTotal += res.score * weight;
    }

    const overallScore =
      totalAssignedWeight > 0
        ? Math.round((weightedScoreTotal / totalAssignedWeight) * 10) / 10
        : 0;

    // Construct honest summary text
    let summary: string;
    if (degraded) {
      const parts: string[] = [
        `Partial evaluation completed (degraded mode).`,
        `Evaluators executed: [${provenance.evaluatorsRun.join(', ')}].`,
      ];
      if (provenance.evaluatorsFailed.length > 0) {
        parts.push(`Failed: [${provenance.evaluatorsFailed.join(', ')}].`);
      }
      if (provenance.evaluatorsSkipped.length > 0) {
        parts.push(`Skipped: [${provenance.evaluatorsSkipped.join(', ')}].`);
      }
      parts.push(`Overall score: ${overallScore}/5.0.`);
      summary = parts.join(' ');
    } else {
      summary = `Complete evaluation completed. Evaluators executed: [${provenance.evaluatorsRun.join(', ')}]. Overall score: ${overallScore}/5.0.`;
    }

    return {
      attemptId,
      rubricVersion: rubric.rubricVersion,
      evaluatorsRun: [...provenance.evaluatorsRun],
      evaluatorsFailed: [...provenance.evaluatorsFailed],
      evaluatorsSkipped: [...provenance.evaluatorsSkipped],
      dimensionsMissing,
      overallScoreComparable,
      dimensionResults: [...results],
      overallScore,
      summary,
      degraded,
      evaluatedAt: this.clock.now(),
    };
  }
}
