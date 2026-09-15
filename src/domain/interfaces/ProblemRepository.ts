import type { Problem } from '../models/Problem.js';

/**
 * Repository interface for retrieving practice problems and their associated rubrics.
 */
export interface ProblemRepository {
  findById(id: string): Promise<Problem | null>;
  findAll(): Promise<readonly Problem[]>;
}
