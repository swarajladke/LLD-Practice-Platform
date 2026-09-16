import {
  CorruptAttemptStateError,
  IllegalTransitionError,
} from '../errors/DomainErrors.js';
import type { DesignSpec } from './DesignSpec.js';
import type { EvaluationReport } from './EvaluationReport.js';
import { type Clock, defaultClock } from '../services/Clock.js';

export const ATTEMPT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'EVALUATING',
  'EVALUATED',
  'FAILED',
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/**
 * Strongly-typed discriminated union for Attempt state.
 * Invariants enforced by type system:
 * - report exists ONLY when status === 'EVALUATED'
 * - errorMessage exists ONLY when status === 'FAILED'
 * - spec is guaranteed when status === 'EVALUATING' or 'EVALUATED'
 * - idempotencyKey is guaranteed once submitted
 * - evaluationStartedAt is tracked when transitioning to EVALUATING
 */
export type AttemptState =
  | {
      readonly status: 'DRAFT';
      readonly rawSubmission: unknown;
      readonly formatId: string;
      readonly spec?: DesignSpec;
    }
  | {
      readonly status: 'SUBMITTED';
      readonly rawSubmission: unknown;
      readonly formatId: string;
      readonly idempotencyKey: string;
      readonly spec?: DesignSpec;
    }
  | {
      readonly status: 'EVALUATING';
      readonly rawSubmission: unknown;
      readonly formatId: string;
      readonly idempotencyKey: string;
      readonly spec: DesignSpec;
      readonly evaluationStartedAt: string;
    }
  | {
      readonly status: 'EVALUATED';
      readonly rawSubmission: unknown;
      readonly formatId: string;
      readonly idempotencyKey: string;
      readonly spec: DesignSpec;
      readonly report: EvaluationReport;
      readonly evaluationStartedAt?: string;
    }
  | {
      readonly status: 'FAILED';
      readonly rawSubmission: unknown;
      readonly formatId: string;
      readonly idempotencyKey: string;
      readonly spec?: DesignSpec;
      readonly errorMessage: string;
      readonly evaluationStartedAt?: string;
    };

export interface AttemptInitParams {
  readonly id: string;
  readonly problemId: string;
  readonly learnerId: string;
  readonly formatId: string;
  readonly rawSubmission: unknown;
  readonly spec?: DesignSpec;
  readonly clock?: Clock;
}

export interface AttemptSubmittedInitParams extends AttemptInitParams {
  readonly idempotencyKey: string;
}

export interface AttemptRehydrateParams {
  readonly id: string;
  readonly problemId: string;
  readonly learnerId: string;
  readonly state: AttemptState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly clock?: Clock;
}

/**
 * Attempt Aggregate Root owning its lifecycle state machine.
 */
export class Attempt {
  readonly id: string;
  readonly problemId: string;
  readonly learnerId: string;
  private _state: AttemptState;
  readonly createdAt: string;
  private _updatedAt: string;
  private readonly clock: Clock;

  private constructor(
    id: string,
    problemId: string,
    learnerId: string,
    state: AttemptState,
    createdAt: string,
    updatedAt: string,
    clock: Clock = defaultClock
  ) {
    this.id = id;
    this.problemId = problemId;
    this.learnerId = learnerId;
    this._state = state;
    this.createdAt = createdAt;
    this._updatedAt = updatedAt;
    this.clock = clock;
  }

  static createDraft(params: AttemptInitParams): Attempt {
    const clock = params.clock ?? defaultClock;
    const now = clock.now();
    return new Attempt(
      params.id,
      params.problemId,
      params.learnerId,
      {
        status: 'DRAFT',
        rawSubmission: params.rawSubmission,
        formatId: params.formatId,
        spec: params.spec,
      },
      now,
      now,
      clock
    );
  }

  static createSubmitted(params: AttemptSubmittedInitParams): Attempt {
    if (!params.idempotencyKey || params.idempotencyKey.trim().length === 0) {
      throw new Error('idempotencyKey is required when creating a submitted attempt');
    }
    const clock = params.clock ?? defaultClock;
    const now = clock.now();
    return new Attempt(
      params.id,
      params.problemId,
      params.learnerId,
      {
        status: 'SUBMITTED',
        rawSubmission: params.rawSubmission,
        formatId: params.formatId,
        idempotencyKey: params.idempotencyKey.trim(),
        spec: params.spec,
      },
      now,
      now,
      clock
    );
  }

  static rehydrate(params: AttemptRehydrateParams): Attempt {
    const { id, state } = params;

    if (!params.id || params.id.trim().length === 0) {
      throw new CorruptAttemptStateError(id ?? 'unknown', 'Missing attempt id');
    }
    if (!params.problemId || !params.learnerId) {
      throw new CorruptAttemptStateError(id, 'Missing problemId or learnerId');
    }
    if (!state || !state.status) {
      throw new CorruptAttemptStateError(id, 'Missing state or status');
    }

    switch (state.status) {
      case 'DRAFT':
        if (!state.formatId) {
          throw new CorruptAttemptStateError(id, 'DRAFT state missing formatId');
        }
        break;
      case 'SUBMITTED':
        if (!state.idempotencyKey || state.idempotencyKey.trim().length === 0) {
          throw new CorruptAttemptStateError(id, 'SUBMITTED state missing idempotencyKey');
        }
        break;
      case 'EVALUATING':
        if (!state.idempotencyKey || state.idempotencyKey.trim().length === 0) {
          throw new CorruptAttemptStateError(id, 'EVALUATING state missing idempotencyKey');
        }
        if (!state.spec) {
          throw new CorruptAttemptStateError(id, 'EVALUATING state missing spec');
        }
        break;
      case 'EVALUATED':
        if (!state.idempotencyKey || state.idempotencyKey.trim().length === 0) {
          throw new CorruptAttemptStateError(id, 'EVALUATED state missing idempotencyKey');
        }
        if (!state.spec) {
          throw new CorruptAttemptStateError(id, 'EVALUATED state missing spec');
        }
        if (!state.report || !state.report.attemptId) {
          throw new CorruptAttemptStateError(id, 'EVALUATED state missing valid report');
        }
        break;
      case 'FAILED':
        if (!state.idempotencyKey || state.idempotencyKey.trim().length === 0) {
          throw new CorruptAttemptStateError(id, 'FAILED state missing idempotencyKey');
        }
        if (!state.errorMessage || state.errorMessage.trim().length === 0) {
          throw new CorruptAttemptStateError(id, 'FAILED state missing errorMessage');
        }
        break;
      default:
        throw new CorruptAttemptStateError(id, `Unrecognized status '${(state as any).status}'`);
    }

    return new Attempt(
      params.id,
      params.problemId,
      params.learnerId,
      params.state,
      params.createdAt,
      params.updatedAt,
      params.clock ?? defaultClock
    );
  }

  get state(): AttemptState {
    return this._state;
  }

  get status(): AttemptStatus {
    return this._state.status;
  }

  get updatedAt(): string {
    return this._updatedAt;
  }

  get rawSubmission(): unknown {
    return this._state.rawSubmission;
  }

  get formatId(): string {
    return this._state.formatId;
  }

  get idempotencyKey(): string | undefined {
    return 'idempotencyKey' in this._state ? this._state.idempotencyKey : undefined;
  }

  get spec(): DesignSpec | undefined {
    return this._state.spec;
  }

  get report(): EvaluationReport | undefined {
    return this._state.status === 'EVALUATED' ? this._state.report : undefined;
  }

  get errorMessage(): string | undefined {
    return this._state.status === 'FAILED' ? this._state.errorMessage : undefined;
  }

  get evaluationStartedAt(): string | undefined {
    return 'evaluationStartedAt' in this._state ? this._state.evaluationStartedAt : undefined;
  }

  get degraded(): boolean {
    return this.report?.degraded ?? false;
  }

  // --- State Machine Transitions ---

  submit(idempotencyKey: string, spec?: DesignSpec): void {
    if (this._state.status !== 'DRAFT') {
      throw new IllegalTransitionError(this._state.status, 'submit');
    }
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new Error('idempotencyKey is required on submit');
    }

    this._state = {
      status: 'SUBMITTED',
      rawSubmission: this._state.rawSubmission,
      formatId: this._state.formatId,
      idempotencyKey: idempotencyKey.trim(),
      spec: spec ?? this._state.spec,
    };
    this._updatedAt = this.clock.now();
  }

  beginEvaluation(spec: DesignSpec): void {
    if (this._state.status !== 'SUBMITTED') {
      throw new IllegalTransitionError(this._state.status, 'beginEvaluation');
    }
    if (!spec) {
      throw new Error('DesignSpec is required to begin evaluation');
    }

    const now = this.clock.now();
    this._state = {
      status: 'EVALUATING',
      rawSubmission: this._state.rawSubmission,
      formatId: this._state.formatId,
      idempotencyKey: this._state.idempotencyKey,
      spec,
      evaluationStartedAt: now,
    };
    this._updatedAt = now;
  }

  completeWith(report: EvaluationReport): void {
    if (this._state.status !== 'EVALUATING') {
      throw new IllegalTransitionError(this._state.status, 'completeWith');
    }
    if (!report) {
      throw new Error('EvaluationReport is required to complete evaluation');
    }
    if (report.degraded) {
      throw new Error('Cannot complete with a degraded report via completeWith; use degradeWith');
    }

    const prevStarted = this._state.evaluationStartedAt;
    this._state = {
      status: 'EVALUATED',
      rawSubmission: this._state.rawSubmission,
      formatId: this._state.formatId,
      idempotencyKey: this._state.idempotencyKey,
      spec: this._state.spec,
      report,
      evaluationStartedAt: prevStarted,
    };
    this._updatedAt = this.clock.now();
  }

  degradeWith(partialReport: EvaluationReport): void {
    if (this._state.status !== 'EVALUATING') {
      throw new IllegalTransitionError(this._state.status, 'degradeWith');
    }
    if (!partialReport) {
      throw new Error('Partial EvaluationReport is required to degrade evaluation');
    }
    if (!partialReport.degraded) {
      throw new Error('degradeWith requires a report with degraded=true');
    }

    const prevStarted = this._state.evaluationStartedAt;
    this._state = {
      status: 'EVALUATED',
      rawSubmission: this._state.rawSubmission,
      formatId: this._state.formatId,
      idempotencyKey: this._state.idempotencyKey,
      spec: this._state.spec,
      report: partialReport,
      evaluationStartedAt: prevStarted,
    };
    this._updatedAt = this.clock.now();
  }

  fail(reason: string): void {
    if (this._state.status !== 'EVALUATING' && this._state.status !== 'SUBMITTED') {
      throw new IllegalTransitionError(this._state.status, 'fail');
    }
    if (!reason || reason.trim().length === 0) {
      throw new Error('Failure reason cannot be empty');
    }

    const idempotencyKey = this._state.idempotencyKey;
    const prevStarted = 'evaluationStartedAt' in this._state ? this._state.evaluationStartedAt : undefined;

    this._state = {
      status: 'FAILED',
      rawSubmission: this._state.rawSubmission,
      formatId: this._state.formatId,
      idempotencyKey,
      spec: this._state.spec,
      errorMessage: reason.trim(),
      evaluationStartedAt: prevStarted,
    };
    this._updatedAt = this.clock.now();
  }
}
