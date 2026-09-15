import type { Evaluator, EvaluationContext } from '../../domain/interfaces/Evaluator.js';
import type { DimensionResult, Finding } from '../../domain/models/DimensionResult.js';
import type { EvaluatorProvenance } from '../../domain/models/EvaluationReport.js';
import { RUBRIC_DIMENSIONS, type RubricDimension } from '../../domain/models/Rubric.js';
import { EvaluationFailedError } from '../../domain/errors/DomainErrors.js';

export interface CompositeEvaluatorConfig {
  readonly id?: string;
  readonly timeoutMs?: number; // default 15000ms
}

/**
 * Wraps a promise in a timeout. Rejects with an error if time elapses.
 */
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
 * - Implements Evaluator, returning readonly DimensionResult[].
 * - Runs child evaluators concurrently using Promise.allSettled with per-evaluator timeouts.
 * - Resolves conflicts across overlapping dimensions using confidence-weighted average.
 * - Exposes full provenance (run, failed, skipped).
 * - Fully nestable inside other CompositeEvaluators.
 */
export class CompositeEvaluator implements Evaluator {
  readonly id: string;
  private readonly evaluators: readonly Evaluator[];
  private readonly timeoutMs: number;
  private lastProvenance: EvaluatorProvenance = {
    evaluatorsRun: [],
    evaluatorsFailed: [],
    evaluatorsSkipped: [],
  };

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

  getProvenance(): EvaluatorProvenance {
    return {
      evaluatorsRun: [...this.lastProvenance.evaluatorsRun],
      evaluatorsFailed: [...this.lastProvenance.evaluatorsFailed],
      evaluatorsSkipped: [...this.lastProvenance.evaluatorsSkipped],
    };
  }

  async evaluate(ctx: EvaluationContext): Promise<readonly DimensionResult[]> {
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

    // Run active evaluators concurrently with timeouts
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
        // If child is a CompositeEvaluator, merge its sub-provenance
        if ('getProvenance' in evaluator && typeof (evaluator as any).getProvenance === 'function') {
          const childProv = (evaluator as any).getProvenance() as EvaluatorProvenance;
          evaluatorsFailed.push(...childProv.evaluatorsFailed);
          evaluatorsSkipped.push(...childProv.evaluatorsSkipped);
        }

        for (const res of outcome.value) {
          const list = dimensionResultsMap.get(res.criterion) ?? [];
          list.push(res);
          dimensionResultsMap.set(res.criterion, list);
        }
      } else {
        const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        evaluatorsFailed.push(`${evaluator.id} (${reason})`);
      }
    }

    this.lastProvenance = {
      evaluatorsRun: Array.from(new Set(evaluatorsRun)),
      evaluatorsFailed: Array.from(new Set(evaluatorsFailed)),
      evaluatorsSkipped: Array.from(new Set(evaluatorsSkipped)),
    };

    if (evaluatorsRun.length === 0) {
      throw new EvaluationFailedError(
        `All active evaluators failed: [${evaluatorsFailed.join(', ')}]`
      );
    }

    // Merge candidates per dimension
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

    return mergedResults;
  }
}
