import type { Evaluator, EvaluationContext } from '../../domain/interfaces/Evaluator.js';
import type { DimensionResult, Finding } from '../../domain/models/DimensionResult.js';
import type { EvaluatorProvenance, FailedEvaluatorInfo } from '../../domain/models/EvaluationReport.js';
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

export type EvaluatorChild = Evaluator | CompositeEvaluator;

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
 * - Pure stateless evaluation orchestration engine (does not implement Evaluator).
 * - Concurrently executes child evaluators using Promise.allSettled with per-evaluator timeouts.
 * - Returns CompositeEvaluationResult { results, provenance } atomically per evaluation call.
 * - Resolves overlapping dimensions via confidence-weighted averaging.
 * - Namespaces nested child ids as `<parentId>/<childId>`.
 */
export class CompositeEvaluator {
  readonly id: string;
  private readonly evaluators: readonly EvaluatorChild[];
  private readonly timeoutMs: number;

  constructor(evaluators: readonly EvaluatorChild[], config?: CompositeEvaluatorConfig) {
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
    const evaluatorsFailed: FailedEvaluatorInfo[] = [];
    const evaluatorsSkipped: string[] = [];

    const activeEvaluators: EvaluatorChild[] = [];

    for (const evaluator of this.evaluators) {
      if (!evaluator.supports(ctx)) {
        evaluatorsSkipped.push(evaluator.id);
      } else {
        activeEvaluators.push(evaluator);
      }
    }

    const executionPromises = activeEvaluators.map((evaluator) => {
      if (evaluator instanceof CompositeEvaluator) {
        return withTimeout(evaluator.evaluate(ctx), this.timeoutMs, evaluator.id).then(
          (res) => ({ kind: 'composite' as const, evaluator, res })
        );
      } else {
        return withTimeout(evaluator.evaluate(ctx), this.timeoutMs, evaluator.id).then(
          (res) => ({ kind: 'leaf' as const, evaluator, res })
        );
      }
    });

    const settledResults = await Promise.allSettled(executionPromises);

    const dimensionResultsMap = new Map<RubricDimension, DimensionResult[]>();

    for (let i = 0; i < activeEvaluators.length; i++) {
      const evaluator = activeEvaluators[i];
      const outcome = settledResults[i];

      if (outcome.status === 'fulfilled') {
        const val = outcome.value;
        if (val.kind === 'composite') {
          const compResult = val.res;
          for (const runId of compResult.provenance.evaluatorsRun) {
            evaluatorsRun.push(`${evaluator.id}/${runId}`);
          }
          for (const failed of compResult.provenance.evaluatorsFailed) {
            evaluatorsFailed.push({
              id: `${evaluator.id}/${failed.id}`,
              reason: failed.reason,
            });
          }
          for (const skipId of compResult.provenance.evaluatorsSkipped) {
            evaluatorsSkipped.push(`${evaluator.id}/${skipId}`);
          }
          for (const res of compResult.results) {
            const list = dimensionResultsMap.get(res.criterion) ?? [];
            list.push(res);
            dimensionResultsMap.set(res.criterion, list);
          }
        } else {
          evaluatorsRun.push(evaluator.id);
          for (const res of val.res) {
            const list = dimensionResultsMap.get(res.criterion) ?? [];
            list.push(res);
            dimensionResultsMap.set(res.criterion, list);
          }
        }
      } else {
        const reason =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        evaluatorsFailed.push({ id: evaluator.id, reason });
      }
    }

    // Deduplicate failed by id
    const failedMap = new Map<string, FailedEvaluatorInfo>();
    for (const f of evaluatorsFailed) {
      if (!failedMap.has(f.id)) {
        failedMap.set(f.id, f);
      }
    }
    const uniqueFailed = Array.from(failedMap.values());
    const failedIds = new Set(uniqueFailed.map((f) => f.id));

    // Ensure a nested evaluator never appears in both evaluatorsRun and evaluatorsFailed
    const uniqueRun = Array.from(new Set(evaluatorsRun)).filter((id) => !failedIds.has(id));
    const uniqueSkipped = Array.from(new Set(evaluatorsSkipped));

    const provenance: EvaluatorProvenance = {
      evaluatorsRun: uniqueRun,
      evaluatorsFailed: uniqueFailed,
      evaluatorsSkipped: uniqueSkipped,
    };

    if (uniqueRun.length === 0) {
      throw new EvaluationFailedError(
        `All active evaluators failed: [${uniqueFailed.map((f) => `${f.id} (${f.reason})`).join(', ')}]`
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
