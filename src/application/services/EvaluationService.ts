import { Attempt } from '../../domain/models/Attempt.js';
import type { AttemptRepository } from '../../domain/interfaces/AttemptRepository.js';
import type { ProblemRepository } from '../../domain/interfaces/ProblemRepository.js';
import type { SubmissionFormat } from '../../domain/interfaces/SubmissionFormat.js';
import type { EvaluationContext } from '../../domain/interfaces/Evaluator.js';
import { CompositeEvaluator } from '../evaluators/CompositeEvaluator.js';
import { EvaluationReportAssembler } from '../evaluators/EvaluationReportAssembler.js';
import type { Clock } from '../../domain/services/Clock.js';
import { defaultClock } from '../../domain/services/Clock.js';

export interface SubmitAttemptRequest {
  readonly id?: string;
  readonly problemId: string;
  readonly learnerId: string;
  readonly formatId: string;
  readonly rawSubmission: unknown;
  readonly idempotencyKey: string;
}

export interface SubmitAttemptResult {
  readonly attemptId: string;
  readonly status: string;
  readonly isExisting: boolean;
  readonly validationErrors?: readonly { path: string; message: string }[];
}

export class EvaluationService {
  constructor(
    private readonly attemptRepo: AttemptRepository,
    private readonly problemRepo: ProblemRepository,
    private readonly formats: Map<string, SubmissionFormat>,
    private readonly compositeEvaluator: CompositeEvaluator,
    private readonly assembler: EvaluationReportAssembler,
    private readonly clock: Clock = defaultClock
  ) {}

  /**
   * Submits an attempt idempotently, persists immediately as SUBMITTED,
   * launches async background evaluation, and returns immediately with attemptId + status.
   */
  async submitAttempt(request: SubmitAttemptRequest): Promise<SubmitAttemptResult> {
    const { learnerId, problemId, formatId, rawSubmission, idempotencyKey } = request;

    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new Error('idempotencyKey is required for submission');
    }

    // 1. Idempotency check: if an attempt with this key already exists for this learner, return it
    const existing = await this.attemptRepo.findByIdempotencyKey(learnerId, idempotencyKey.trim());
    if (existing) {
      return {
        attemptId: existing.id,
        status: existing.status,
        isExisting: true,
      };
    }

    // 2. Validate problem exists
    const problem = await this.problemRepo.findById(problemId);
    if (!problem) {
      throw new Error(`Problem with id '${problemId}' not found`);
    }

    // 3. Resolve submission format
    const format = this.formats.get(formatId);
    if (!format) {
      throw new Error(`Unsupported submission format '${formatId}'`);
    }

    // 4. Parse and validate raw payload
    const parseResult = format.parseAndValidate(rawSubmission);
    if (!parseResult.success || !parseResult.spec) {
      return {
        attemptId: '',
        status: 'VALIDATION_FAILED',
        isExisting: false,
        validationErrors: parseResult.errors ?? [{ path: 'root', message: 'Invalid submission format' }],
      };
    }

    // 5. Persist submission BEFORE evaluation starts so it survives evaluator failure
    const attemptId = request.id ?? `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

    // 6. Launch in-process async evaluation (non-blocking)
    // Run un-awaited so the submit endpoint returns immediately
    void this.runEvaluationAsync(attemptId, problemId, parseResult.spec);

    return {
      attemptId: attempt.id,
      status: attempt.status,
      isExisting: false,
    };
  }

  /**
   * Internal async runner orchestrating the state machine and evaluation lifecycle.
   */
  async runEvaluationAsync(
    attemptId: string,
    problemId: string,
    spec: NonNullable<Attempt['spec']>
  ): Promise<void> {
    const attempt = await this.attemptRepo.findById(attemptId);
    const problem = await this.problemRepo.findById(problemId);

    if (!attempt || !problem) {
      return;
    }

    try {
      // Transition: SUBMITTED -> EVALUATING
      attempt.beginEvaluation(spec);
      await this.attemptRepo.save(attempt);

      const ctx: EvaluationContext = {
        attemptId,
        spec,
        problem,
        rubric: problem.rubric,
      };

      // Run composite evaluation
      const dimensionResults = await this.compositeEvaluator.evaluate(ctx);
      const provenance = this.compositeEvaluator.getProvenance();

      // Assemble final report
      const report = this.assembler.assemble({
        attemptId,
        rubric: problem.rubric,
        results: dimensionResults,
        provenance,
      });

      // Transition: EVALUATING -> EVALUATED (healthy or degraded)
      if (report.degraded) {
        attempt.degradeWith(report);
      } else {
        attempt.completeWith(report);
      }

      await this.attemptRepo.save(attempt);
    } catch (evalError) {
      const reason = evalError instanceof Error ? evalError.message : String(evalError);
      try {
        attempt.fail(reason);
        await this.attemptRepo.save(attempt);
      } catch {
        // Safe fallback
      }
    }
  }
}
