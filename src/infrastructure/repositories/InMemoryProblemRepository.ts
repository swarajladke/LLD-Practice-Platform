import type { ProblemRepository } from '../../domain/interfaces/ProblemRepository.js';
import type { Problem } from '../../domain/models/Problem.js';
import { SEEDED_PROBLEMS } from '../seeds/problemSeeds.js';

export class InMemoryProblemRepository implements ProblemRepository {
  private readonly problems = new Map<string, Problem>();

  constructor(initialProblems: readonly Problem[] = SEEDED_PROBLEMS) {
    for (const p of initialProblems) {
      this.problems.set(p.id, p);
    }
  }

  async findById(id: string): Promise<Problem | null> {
    return this.problems.get(id) ?? null;
  }

  async findAll(): Promise<readonly Problem[]> {
    return Array.from(this.problems.values());
  }
}
