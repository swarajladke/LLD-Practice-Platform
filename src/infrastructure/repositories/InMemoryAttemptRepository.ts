import { DuplicateIdempotencyKeyError } from '../../domain/errors/DomainErrors.js';
import type { AttemptRepository } from '../../domain/interfaces/AttemptRepository.js';
import type { Attempt } from '../../domain/models/Attempt.js';

export class InMemoryAttemptRepository implements AttemptRepository {
  private readonly attemptsById = new Map<string, Attempt>();
  private readonly idempotencyIndex = new Map<string, string>();

  async save(attempt: Attempt): Promise<void> {
    const idempotencyKey = attempt.idempotencyKey;
    if (idempotencyKey) {
      const compositeKey = `${attempt.learnerId}:${idempotencyKey}`;
      const existingId = this.idempotencyIndex.get(compositeKey);
      if (existingId && existingId !== attempt.id) {
        throw new DuplicateIdempotencyKeyError(attempt.learnerId, idempotencyKey);
      }
      this.idempotencyIndex.set(compositeKey, attempt.id);
    }

    this.attemptsById.set(attempt.id, attempt);
  }

  async findById(id: string): Promise<Attempt | null> {
    return this.attemptsById.get(id) ?? null;
  }

  async findByIdempotencyKey(learnerId: string, key: string): Promise<Attempt | null> {
    const compositeKey = `${learnerId}:${key}`;
    const attemptId = this.idempotencyIndex.get(compositeKey);
    if (!attemptId) return null;
    return this.attemptsById.get(attemptId) ?? null;
  }

  async findByLearnerAndProblem(learnerId: string, problemId: string): Promise<readonly Attempt[]> {
    const results: Attempt[] = [];
    for (const attempt of this.attemptsById.values()) {
      if (attempt.learnerId === learnerId && attempt.problemId === problemId) {
        results.push(attempt);
      }
    }
    return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listByLearner(learnerId: string): Promise<readonly Attempt[]> {
    const results: Attempt[] = [];
    for (const attempt of this.attemptsById.values()) {
      if (attempt.learnerId === learnerId) {
        results.push(attempt);
      }
    }
    return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async findEvaluating(): Promise<readonly Attempt[]> {
    const results: Attempt[] = [];
    for (const attempt of this.attemptsById.values()) {
      if (attempt.status === 'EVALUATING') {
        results.push(attempt);
      }
    }
    return results;
  }

  clear(): void {
    this.attemptsById.clear();
    this.idempotencyIndex.clear();
  }
}
