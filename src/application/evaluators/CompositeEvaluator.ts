import type { Evaluator, EvaluationContext } from '../../domain/interfaces/Evaluator.js';
import type { DimensionResult, Finding } from '../../domain/models/DimensionResult.js';
import type { EvaluationReport } from '../../domain/models/EvaluationReport.js';
import { RUBRIC_DIMENSIONS, type RubricDimension } from '../../domain/models/Rubric.js';

/**
 * CompositeEvaluator executing registered evaluators in composite fashion.
 * Resilient against individual evaluator failures:
 * - Survives when one evaluator throws (e.g. LLM timeout or unparseable JSON).
 * - Records evaluatorsRun and evaluatorsFailed.
 * - Merges overlapping dimensions using confidence weighting.
 * - Emits a valid EvaluationReport with degraded=true on partial failures.
 */
export class CompositeEvaluator {
  constructor(private readonly evaluators: readonly Evaluator[]) {
    if (!evaluators || evaluators.length === 0) {
      throw new Error('CompositeEvaluator requires at least one evaluator');
    }
  }

  async evaluate(ctx: EvaluationContext): Promise<EvaluationReport> {
    const evaluatorsRun: string[] = [];
    const evaluatorsFailed: string[] = [];
    const dimensionResultsMap = new Map<RubricDimension, DimensionResult[]>();

    for (const evaluator of this.evaluators) {
      if (!evaluator.supports(ctx)) {
        continue;
      }

      try {
        const results = await evaluator.evaluate(ctx);
        evaluatorsRun.push(evaluator.id);
        for (const res of results) {
          const list = dimensionResultsMap.get(res.criterion) ?? [];
          list.push(res);
          dimensionResultsMap.set(res.criterion, list);
        }
      } catch {
        evaluatorsFailed.push(evaluator.id);
      }
    }

    if (evaluatorsRun.length === 0) {
      throw new Error(
        `All registered evaluators failed: [${evaluatorsFailed.join(', ')}]`
      );
    }

    // Merge dimension results by confidence weighting
    const mergedResults: DimensionResult[] = [];

    for (const dimension of RUBRIC_DIMENSIONS) {
      const candidates = dimensionResultsMap.get(dimension);
      if (!candidates || candidates.length === 0) {
        continue;
      }

      if (candidates.length === 1) {
        mergedResults.push(candidates[0]);
        continue;
      }

      // Confidence-weighted merge across multiple evaluators
      let totalWeight = 0;
      let weightedScoreSum = 0;
      const combinedFindings: Finding[] = [];
      const evaluatorIds: string[] = [];
      let maxConfidence = 0;

      for (const cand of candidates) {
        // Avoid division by zero: minimum confidence floor 0.1
        const weight = Math.max(0.1, cand.confidence);
        totalWeight += weight;
        weightedScoreSum += cand.score * weight;
        combinedFindings.push(...cand.findings);
        evaluatorIds.push(cand.evaluatorId);
        if (cand.confidence > maxConfidence) {
          maxConfidence = cand.confidence;
        }
      }

      const mergedScore = Math.round((weightedScoreSum / totalWeight) * 10) / 10;

      mergedResults.push({
        criterion: dimension,
        findings: combinedFindings,
        score: mergedScore,
        confidence: maxConfidence,
        evaluatorId: `composite(${evaluatorIds.join('+')})`,
      });
    }

    // Calculate overall weighted score based on rubric dimension weights
    let totalAssignedWeight = 0;
    let weightedScoreTotal = 0;

    for (const res of mergedResults) {
      const dimWeight = ctx.rubric.dimensionWeights[res.criterion] ?? 0;
      totalAssignedWeight += dimWeight;
      weightedScoreTotal += res.score * dimWeight;
    }

    const overallScore =
      totalAssignedWeight > 0
        ? Math.round((weightedScoreTotal / totalAssignedWeight) * 10) / 10
        : 0;

    const degraded = evaluatorsFailed.length > 0;

    const summary = degraded
      ? `Partial evaluation completed (degraded mode). Evaluators executed: [${evaluatorsRun.join(', ')}]. Failed: [${evaluatorsFailed.join(', ')}]. Overall score: ${overallScore}/5.0.`
      : `Complete evaluation completed. Evaluators executed: [${evaluatorsRun.join(', ')}]. Overall score: ${overallScore}/5.0.`;

    return {
      attemptId: ctx.attemptId,
      rubricVersion: ctx.rubric.rubricVersion,
      evaluatorsRun,
      evaluatorsFailed,
      dimensionResults: mergedResults,
      overallScore,
      summary,
      degraded,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
