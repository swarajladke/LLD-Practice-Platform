/**
 * Domain errors enforcing state machine invariants and persistence constraints.
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
