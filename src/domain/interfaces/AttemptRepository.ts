import type { Attempt } from '../models/Attempt.js';

/**
 * Repository interface for persisting and retrieving learner attempts.
 * Pure domain interface - isolated from persistence details (SQLite vs In-Memory).
 */
export interface AttemptRepository {
  save(attempt: Attempt): Promise<void>;
  findById(id: string): Promise<Attempt | null>;
  findByIdempotencyKey(learnerId: string, key: string): Promise<Attempt | null>;
  findByLearnerAndProblem(learnerId: string, problemId: string): Promise<readonly Attempt[]>;
  listByLearner(learnerId: string): Promise<readonly Attempt[]>;
  findEvaluating(): Promise<readonly Attempt[]>;
}
