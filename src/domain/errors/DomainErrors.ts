/**
 * Domain errors enforcing state machine invariants, persistence constraints,
 * and API contracts.
 */
export class IllegalTransitionError extends Error {
  constructor(currentStatus: string, action: string) {
    super(`Illegal transition: cannot perform '${action}' from status '${currentStatus}'`);
    this.name = 'IllegalTransitionError';
  }
}

export class DuplicateIdempotencyKeyError extends Error {
  constructor(learnerId: string, idempotencyKey: string) {
    super(`Duplicate idempotencyKey '${idempotencyKey}' for learner '${learnerId}'`);
    this.name = 'DuplicateIdempotencyKeyError';
  }
}

export class IdempotencyPayloadMismatchError extends Error {
  constructor(idempotencyKey: string) {
    super(`Idempotency key '${idempotencyKey}' was previously used with a different submission payload`);
    this.name = 'IdempotencyPayloadMismatchError';
  }
}

export class ProblemNotFoundError extends Error {
  constructor(problemId: string) {
    super(`Problem '${problemId}' not found`);
    this.name = 'ProblemNotFoundError';
  }
}

export class UnsupportedFormatError extends Error {
  constructor(formatId: string) {
    super(`Unsupported submission format '${formatId}'`);
    this.name = 'UnsupportedFormatError';
  }
}

export class ValidationFailedError extends Error {
  readonly validationErrors: readonly { path: string; message: string }[];

  constructor(errors: readonly { path: string; message: string }[]) {
    super(`Validation failed for submission: ${errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`);
    this.name = 'ValidationFailedError';
    this.validationErrors = errors;
  }
}

export class PayloadTooLargeError extends Error {
  constructor(actualSize: number, maxSize: number) {
    super(`Submission payload size (${actualSize} chars) exceeds maximum limit of ${maxSize} chars`);
    this.name = 'PayloadTooLargeError';
  }
}

export class CorruptAttemptStateError extends Error {
  constructor(attemptId: string, reason: string) {
    super(`Corrupt attempt state for attempt '${attemptId}': ${reason}`);
    this.name = 'CorruptAttemptStateError';
  }
}

export class EvaluationFailedError extends Error {
  constructor(reason: string) {
    super(`Evaluation failed: ${reason}`);
    this.name = 'EvaluationFailedError';
  }
}
