import type { Evaluator, EvaluationContext } from '../../domain/interfaces/Evaluator.js';
import type { DimensionResult, Finding } from '../../domain/models/DimensionResult.js';
import type { EvaluatorProvenance } from '../../domain/models/EvaluationReport.js';
import { RUBRIC_DIMENSIONS, type RubricDimension } from '../../domain/models/Rubric.js';
import { EvaluationFailedError } from '../../domain/errors/DomainErrors.js';

export interface CompositeEvaluatorConfig {
  readonly id?: string;
  readonly timeoutMs?: number; // default 15000ms
}

export interface CompositeEvaluationResult {
  readonly results: readonly DimensionResult[];
  readonly provenance: EvaluatorProvenance;
}

function withTimeout<T>(promise: Promise<T>, ms: number, evaluatorId: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Evaluator '${evaluatorId}' timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

/**
 * CompositeEvaluator:
 * - Pure stateless evaluation engine (no mutable instance properties).
 * - Concurrently executes child evaluators using Promise.allSettled with per-evaluator timeouts.
 * - Returns { results, provenance } atomically per evaluation call.
 * - Resolves overlapping dimensions via confidence-weighted averaging.
 * - Nestable inside other CompositeEvaluators.
 */
export class CompositeEvaluator {
  readonly id: string;
  private readonly evaluators: readonly Evaluator[];
  private readonly timeoutMs: number;

  constructor(evaluators: readonly Evaluator[], config?: CompositeEvaluatorConfig) {
    if (!evaluators || evaluators.length === 0) {
      throw new Error('CompositeEvaluator requires at least one evaluator');
    }
    this.evaluators = evaluators;
    this.id = config?.id ?? 'composite';
    this.timeoutMs = config?.timeoutMs ?? 15000;
  }

  supports(ctx: EvaluationContext): boolean {
    return this.evaluators.some((e) => e.supports(ctx));
  }

  async evaluate(ctx: EvaluationContext): Promise<CompositeEvaluationResult> {
    const evaluatorsRun: string[] = [];
    const evaluatorsFailed: string[] = [];
    const evaluatorsSkipped: string[] = [];

    const activeEvaluators: Evaluator[] = [];

    for (const evaluator of this.evaluators) {
      if (!evaluator.supports(ctx)) {
        evaluatorsSkipped.push(evaluator.id);
      } else {
        activeEvaluators.push(evaluator);
      }
    }

    const settledResults = await Promise.allSettled(
      activeEvaluators.map((evaluator) =>
        withTimeout(evaluator.evaluate(ctx), this.timeoutMs, evaluator.id)
      )
    );

    const dimensionResultsMap = new Map<RubricDimension, DimensionResult[]>();

    for (let i = 0; i < activeEvaluators.length; i++) {
      const evaluator = activeEvaluators[i];
      const outcome = settledResults[i];

      if (outcome.status === 'fulfilled') {
        evaluatorsRun.push(evaluator.id);

        const val = outcome.value as unknown;
        let dimResults: readonly DimensionResult[];

        // Support nested CompositeEvaluator which returns { results, provenance }
        if (val && typeof val === 'object' && 'results' in val && 'provenance' in val) {
          const compResult = val as CompositeEvaluationResult;
          dimResults = compResult.results;
          evaluatorsFailed.push(...compResult.provenance.evaluatorsFailed);
          evaluatorsSkipped.push(...compResult.provenance.evaluatorsSkipped);
        } else {
          dimResults = outcome.value as readonly DimensionResult[];
        }

        for (const res of dimResults) {
          const list = dimensionResultsMap.get(res.criterion) ?? [];
          list.push(res);
          dimensionResultsMap.set(res.criterion, list);
        }
      } else {
        const reason =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        evaluatorsFailed.push(`${evaluator.id} (${reason})`);
      }
    }

    const provenance: EvaluatorProvenance = {
      evaluatorsRun: Array.from(new Set(evaluatorsRun)),
      evaluatorsFailed: Array.from(new Set(evaluatorsFailed)),
      evaluatorsSkipped: Array.from(new Set(evaluatorsSkipped)),
    };

    if (evaluatorsRun.length === 0) {
      throw new EvaluationFailedError(
        `All active evaluators failed: [${evaluatorsFailed.join(', ')}]`
      );
    }

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

      let totalWeight = 0;
      let weightedScoreSum = 0;
      let weightedConfidenceSum = 0;
      const combinedFindings: Finding[] = [];
      const contributorIds = new Set<string>();

      for (const cand of candidates) {
        const weight = Math.max(0.1, cand.confidence);
        totalWeight += weight;
        weightedScoreSum += cand.score * weight;
        weightedConfidenceSum += cand.confidence * weight;
        combinedFindings.push(...cand.findings);
        for (const id of cand.evaluatorIds) {
          contributorIds.add(id);
        }
      }

      const mergedScore = Math.round((weightedScoreSum / totalWeight) * 10) / 10;
      const mergedConfidence = Math.round((weightedConfidenceSum / totalWeight) * 100) / 100;

      mergedResults.push({
        criterion: dimension,
        findings: combinedFindings,
        score: mergedScore,
        confidence: mergedConfidence,
        evaluatorIds: Array.from(contributorIds),
      });
    }

    return {
      results: mergedResults,
      provenance,
    };
  }
}
