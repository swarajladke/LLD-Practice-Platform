import { IllegalTransitionError } from '../errors/DomainErrors.js';
import type { DesignSpec } from './DesignSpec.js';
import type { EvaluationReport } from './EvaluationReport.js';

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
 * Invariants:
 * - report exists ONLY when status === 'EVALUATED'
 * - errorMessage exists ONLY when status === 'FAILED'
 * - spec is guaranteed when status === 'EVALUATING' or 'EVALUATED'
 * - idempotencyKey is guaranteed once submitted
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
    }
  | {
      readonly status: 'EVALUATED';
      readonly rawSubmission: unknown;
      readonly formatId: string;
      readonly idempotencyKey: string;
      readonly spec: DesignSpec;
      readonly report: EvaluationReport;
      readonly degraded: boolean;
    }
  | {
      readonly status: 'FAILED';
      readonly rawSubmission: unknown;
      readonly formatId: string;
      readonly idempotencyKey: string;
      readonly spec?: DesignSpec;
      readonly errorMessage: string;
    };

export interface AttemptInitParams {
  readonly id: string;
  readonly problemId: string;
  readonly learnerId: string;
  readonly formatId: string;
  readonly rawSubmission: unknown;
  readonly spec?: DesignSpec;
  readonly createdAt?: string;
  readonly updatedAt?: string;
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
}

/**
 * Attempt Aggregate Root owning its lifecycle state machine.
 * External code cannot mutate status directly; it must invoke domain methods.
 * Invalid transitions immediately throw IllegalTransitionError.
 */
export class Attempt {
  readonly id: string;
  readonly problemId: string;
  readonly learnerId: string;
  private _state: AttemptState;
  readonly createdAt: string;
  private _updatedAt: string;

  private constructor(
    id: string,
    problemId: string,
    learnerId: string,
    state: AttemptState,
    createdAt: string,
    updatedAt: string
  ) {
    this.id = id;
    this.problemId = problemId;
    this.learnerId = learnerId;
    this._state = state;
    this.createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  /**
   * Factory to create an Attempt in DRAFT status.
   */
  static createDraft(params: AttemptInitParams): Attempt {
    const now = new Date().toISOString();
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
      params.createdAt ?? now,
      params.updatedAt ?? now
    );
  }

  /**
   * Factory to create an Attempt directly in SUBMITTED status.
   */
  static createSubmitted(params: AttemptSubmittedInitParams): Attempt {
    if (!params.idempotencyKey || params.idempotencyKey.trim().length === 0) {
      throw new Error('idempotencyKey is required when creating a submitted attempt');
    }
    const now = new Date().toISOString();
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
      params.createdAt ?? now,
      params.updatedAt ?? now
    );
  }

  /**
   * Rehydrates an Attempt aggregate from persistence.
   */
  static rehydrate(params: AttemptRehydrateParams): Attempt {
    return new Attempt(
      params.id,
      params.problemId,
      params.learnerId,
      params.state,
      params.createdAt,
      params.updatedAt
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

  get degraded(): boolean {
    return this._state.status === 'EVALUATED' ? this._state.degraded : false;
  }

  // --- State Machine Transitions ---

  /**
   * Transitions DRAFT -> SUBMITTED.
   * Requires non-empty idempotencyKey.
   */
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
    this._updatedAt = new Date().toISOString();
  }

  /**
   * Transitions SUBMITTED -> EVALUATING.
   * Requires canonical DesignSpec.
   */
  beginEvaluation(spec: DesignSpec): void {
    if (this._state.status !== 'SUBMITTED') {
      throw new IllegalTransitionError(this._state.status, 'beginEvaluation');
    }
    if (!spec) {
      throw new Error('DesignSpec is required to begin evaluation');
    }

    this._state = {
      status: 'EVALUATING',
      rawSubmission: this._state.rawSubmission,
      formatId: this._state.formatId,
      idempotencyKey: this._state.idempotencyKey,
      spec,
    };
    this._updatedAt = new Date().toISOString();
  }

  /**
   * Transitions EVALUATING -> EVALUATED (healthy/complete).
   */
  completeWith(report: EvaluationReport): void {
    if (this._state.status !== 'EVALUATING') {
      throw new IllegalTransitionError(this._state.status, 'completeWith');
    }
    if (!report) {
      throw new Error('EvaluationReport is required to complete evaluation');
    }

    this._state = {
      status: 'EVALUATED',
      rawSubmission: this._state.rawSubmission,
      formatId: this._state.formatId,
      idempotencyKey: this._state.idempotencyKey,
      spec: this._state.spec,
      report,
      degraded: false,
    };
    this._updatedAt = new Date().toISOString();
  }

  /**
   * Transitions EVALUATING -> EVALUATED (partial/degraded fallback).
   */
  degradeWith(partialReport: EvaluationReport): void {
    if (this._state.status !== 'EVALUATING') {
      throw new IllegalTransitionError(this._state.status, 'degradeWith');
    }
    if (!partialReport) {
      throw new Error('Partial EvaluationReport is required to degrade evaluation');
    }

    this._state = {
      status: 'EVALUATED',
      rawSubmission: this._state.rawSubmission,
      formatId: this._state.formatId,
      idempotencyKey: this._state.idempotencyKey,
      spec: this._state.spec,
      report: partialReport,
      degraded: true,
    };
    this._updatedAt = new Date().toISOString();
  }

  /**
   * Transitions SUBMITTED or EVALUATING -> FAILED.
   */
  fail(reason: string): void {
    if (this._state.status !== 'EVALUATING' && this._state.status !== 'SUBMITTED') {
      throw new IllegalTransitionError(this._state.status, 'fail');
    }
    if (!reason || reason.trim().length === 0) {
      throw new Error('Failure reason cannot be empty');
    }

    const idempotencyKey =
      'idempotencyKey' in this._state ? this._state.idempotencyKey : 'unknown';

    this._state = {
      status: 'FAILED',
      rawSubmission: this._state.rawSubmission,
      formatId: this._state.formatId,
      idempotencyKey,
      spec: this._state.spec,
      errorMessage: reason.trim(),
    };
    this._updatedAt = new Date().toISOString();
  }
}
