import * as crypto from 'node:crypto';
import { Attempt } from '../../domain/models/Attempt.js';
import type { AttemptRepository } from '../../domain/interfaces/AttemptRepository.js';
import type { ProblemRepository } from '../../domain/interfaces/ProblemRepository.js';
import type { SubmissionFormat } from '../../domain/interfaces/SubmissionFormat.js';
import { CompositeEvaluator } from '../evaluators/CompositeEvaluator.js';
import { EvaluationReportAssembler } from '../evaluators/EvaluationReportAssembler.js';
import type { Clock } from '../../domain/services/Clock.js';
import { defaultClock } from '../../domain/services/Clock.js';
import {
  IdempotencyPayloadMismatchError,
  ProblemNotFoundError,
  UnsupportedFormatError,
  ValidationFailedError,
} from '../../domain/errors/DomainErrors.js';

export interface SubmitAttemptRequest {
  readonly id?: string;
  readonly problemId: string;
  readonly learnerId: string;
  readonly formatId?: string;
  readonly rawSubmission: unknown;
  readonly idempotencyKey: string;
}

export type SubmitAttemptResult =
  | {
      readonly outcome: 'accepted';
      readonly attemptId: string;
      readonly status: string;
      readonly isReplay: boolean;
    }
  | {
      readonly outcome: 'rejected';
      readonly validationErrors: readonly { path: string; message: string }[];
    };

export class EvaluationService {
  constructor(
    private readonly attemptRepo: AttemptRepository,
    private readonly problemRepo: ProblemRepository,
    private readonly formats: Map<string, SubmissionFormat>,
    private readonly compositeEvaluator: CompositeEvaluator,
    private readonly assembler: EvaluationReportAssembler,
    private readonly clock: Clock = defaultClock
  ) {}

  async submitAttempt(request: SubmitAttemptRequest): Promise<SubmitAttemptResult> {
    const { learnerId, problemId, rawSubmission, idempotencyKey } = request;
    const formatId = request.formatId || 'structured-text';

    if (!learnerId || learnerId.trim().length === 0) {
      throw new ValidationFailedError([{ path: 'learnerId', message: 'learnerId is required' }]);
    }
    if (!problemId || problemId.trim().length === 0) {
      throw new ValidationFailedError([{ path: 'problemId', message: 'problemId is required' }]);
    }
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new ValidationFailedError([{ path: 'idempotencyKey', message: 'idempotencyKey is required' }]);
    }
    if (rawSubmission === undefined || rawSubmission === null) {
      throw new ValidationFailedError([{ path: 'rawSubmission', message: 'rawSubmission is required' }]);
    }

    // 1. Check idempotency
    const existing = await this.attemptRepo.findByIdempotencyKey(learnerId, idempotencyKey.trim());
    if (existing) {
      const existingRaw = JSON.stringify(existing.rawSubmission);
      const incomingRaw = JSON.stringify(rawSubmission);
      if (existingRaw !== incomingRaw) {
        throw new IdempotencyPayloadMismatchError(idempotencyKey.trim());
      }

      return {
        outcome: 'accepted',
        attemptId: existing.id,
        status: existing.status,
        isReplay: true,
      };
    }

    // 2. Validate problem exists
    const problem = await this.problemRepo.findById(problemId);
    if (!problem) {
      throw new ProblemNotFoundError(problemId);
    }

    // 3. Resolve submission format
    const format = this.formats.get(formatId);
    if (!format) {
      throw new UnsupportedFormatError(formatId);
    }

    // 4. Parse and validate raw payload
    const parseResult = format.parseAndValidate(rawSubmission);
    if (!parseResult.success || !parseResult.spec) {
      return {
        outcome: 'rejected',
        validationErrors: parseResult.errors ?? [{ path: 'root', message: 'Invalid submission format' }],
      };
    }

    // 5. Persist submission BEFORE evaluation starts using crypto.randomUUID()
    const attemptId = request.id ?? crypto.randomUUID();
    const attempt = Attempt.createSubmitted({
      id: attemptId,
      problemId,
      learnerId,
      formatId,
      rawSubmission,
      idempotencyKey: idempotencyKey.trim(),
      spec: parseResult.spec,
      clock: this.clock,
    });

    await this.attemptRepo.save(attempt);

    // 6. Launch in-process async evaluation with unhandled rejection protection
    void this.runEvaluationAsync(attemptId, problemId, parseResult.spec).catch((err) => {
      console.error(`Unhandled background evaluation failure for attempt '${attemptId}':`, err);
    });

    return {
      outcome: 'accepted',
      attemptId: attempt.id,
      status: attempt.status,
      isReplay: false,
    };
  }

  async runEvaluationAsync(
    attemptId: string,
    problemId: string,
    spec: NonNullable<Attempt['spec']>
  ): Promise<void> {
    try {
      const attempt = await this.attemptRepo.findById(attemptId);
      const problem = await this.problemRepo.findById(problemId);

      if (!attempt || !problem) {
        return;
      }

      attempt.beginEvaluation(spec);
      await this.attemptRepo.save(attempt);

      const { results, provenance } = await this.compositeEvaluator.evaluate({
        attemptId,
        spec,
        problem,
        rubric: problem.rubric,
      });

      const report = this.assembler.assemble({
        attemptId,
        rubric: problem.rubric,
        results,
        provenance,
      });

      // Ensure attempt was not marked FAILED by a sweep in the meantime
      const current = await this.attemptRepo.findById(attemptId);
      if (!current || current.status !== 'EVALUATING') {
        return;
      }

      if (report.degraded) {
        current.degradeWith(report);
      } else {
        current.completeWith(report);
      }

      await this.attemptRepo.save(current);
    } catch (evalError) {
      console.error(`Evaluation failure encountered for attempt '${attemptId}':`, evalError);
      try {
        const attempt = await this.attemptRepo.findById(attemptId);
        if (attempt && (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATING')) {
          const reason = evalError instanceof Error ? evalError.message : String(evalError);
          attempt.fail(reason);
          await this.attemptRepo.save(attempt);
        }
      } catch (innerErr) {
        console.error(`Failed to record failure status for attempt '${attemptId}':`, innerErr);
      }
    }
  }

  /**
   * Sweeps and recovers stale attempts left in EVALUATING status past deadlineMs.
   */
  async recoverStaleEvaluations(deadlineMs: number = 30000): Promise<number> {
    const evaluating = await this.attemptRepo.findEvaluating();
    const nowMs = Date.parse(this.clock.now());
    let recoveredCount = 0;

    for (const attempt of evaluating) {
      const startedAt = attempt.evaluationStartedAt ?? attempt.updatedAt;
      const startedMs = Date.parse(startedAt);
      if (nowMs - startedMs > deadlineMs) {
        attempt.fail(
          `Evaluation timed out and was recovered by stale-evaluation sweep (deadline: ${deadlineMs}ms)`
        );
        await this.attemptRepo.save(attempt);
        recoveredCount++;
      }
    }

    return recoveredCount;
  }
}
