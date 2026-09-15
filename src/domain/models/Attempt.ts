import type { DesignSpec } from './DesignSpec.js';
import type { EvaluationReport } from './EvaluationReport.js';

/**
 * State machine states for a submission attempt.
 * Valid progression: DRAFT -> SUBMITTED -> EVALUATING -> EVALUATED | FAILED
 */
export const ATTEMPT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'EVALUATING',
  'EVALUATED',
  'FAILED',
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/**
 * Attempt Entity representing a single learner's submission lifecycle.
 */
export interface Attempt {
  readonly id: string;
  readonly problemId: string;
  readonly learnerId: string;
  readonly idempotencyKey?: string;
  readonly formatId: string;
  readonly rawSubmission: unknown;
  readonly spec?: DesignSpec;
  readonly status: AttemptStatus;
  readonly degraded: boolean;
  readonly report?: EvaluationReport;
  readonly errorMessage?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
