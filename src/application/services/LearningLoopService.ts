import type { Attempt } from '../../domain/models/Attempt.js';
import {
  RUBRIC_DIMENSIONS,
  type RubricDimension,
} from '../../domain/models/Rubric.js';
import type {
  DimensionDelta,
  AttemptWithDeltas,
  RecurringWeakness,
  LearnerWeaknessSummary,
} from '../../domain/models/LearningLoop.js';

export class LearningLoopService {
  /**
   * Computes per-dimension score deltas between two consecutive attempts.
   */
  computeDeltas(previousAttempt: Attempt, currentAttempt: Attempt): DimensionDelta[] {
    const prevReport = previousAttempt.report;
    const currReport = currentAttempt.report;
    if (!prevReport || !currReport) {
      return [];
    }

    const prevScores = new Map<RubricDimension, number>();
    for (const dr of prevReport.dimensionResults) {
      prevScores.set(dr.criterion, dr.score);
    }

    const deltas: DimensionDelta[] = [];
    for (const dr of currReport.dimensionResults) {
      const prevScore = prevScores.get(dr.criterion);
      if (prevScore !== undefined) {
        const delta = Math.round((dr.score - prevScore) * 10) / 10;
        deltas.push({
          criterion: dr.criterion,
          previousScore: prevScore,
          currentScore: dr.score,
          delta,
        });
      }
    }

    return deltas;
  }

  /**
   * Enriches a chronological list of attempts with score deltas from each previous attempt.
   */
  decorateHistoryWithDeltas(attempts: readonly Attempt[]): AttemptWithDeltas[] {
    const evaluated = attempts.filter((a) => a.status === 'EVALUATED' && a.report);
    const result: AttemptWithDeltas[] = [];

    for (let i = 0; i < evaluated.length; i++) {
      const curr = evaluated[i];
      if (i === 0) {
        result.push({ attempt: curr });
      } else {
        const prev = evaluated[i - 1];
        const deltas = this.computeDeltas(prev, curr);
        result.push({ attempt: curr, deltas });
      }
    }

    return result;
  }

  /**
   * Aggregates recurring weaknesses across a learner's evaluated attempts.
   */
  computeWeaknesses(learnerId: string, attempts: readonly Attempt[]): LearnerWeaknessSummary {
    const evaluated = attempts.filter((a) => a.status === 'EVALUATED' && a.report);

    if (evaluated.length === 0) {
      return {
        learnerId,
        totalEvaluatedAttempts: 0,
        recurringWeaknesses: [],
      };
    }

    const statsMap = new Map<
      RubricDimension,
      {
        totalScore: number;
        count: number;
        lowScoreCount: number;
        concerns: string[];
      }
    >();

    for (const dim of RUBRIC_DIMENSIONS) {
      statsMap.set(dim, { totalScore: 0, count: 0, lowScoreCount: 0, concerns: [] });
    }

    for (const att of evaluated) {
      const report = att.report!;
      for (const dr of report.dimensionResults) {
        const stat = statsMap.get(dr.criterion);
        if (stat) {
          stat.totalScore += dr.score;
          stat.count += 1;
          if (dr.score <= 3.0) {
            stat.lowScoreCount += 1;
          }
          for (const f of dr.findings) {
            if (f.concern && !stat.concerns.includes(f.concern)) {
              stat.concerns.push(f.concern);
            }
          }
        }
      }
    }

    const recurringWeaknesses: RecurringWeakness[] = [];

    for (const [criterion, stat] of statsMap.entries()) {
      if (stat.count > 0) {
        const averageScore = Math.round((stat.totalScore / stat.count) * 10) / 10;
        // Flag as weakness if average score is <= 3.5 or scored low at least once
        if (averageScore <= 3.5 || stat.lowScoreCount >= 1) {
          recurringWeaknesses.push({
            criterion,
            averageScore,
            lowScoreCount: stat.lowScoreCount,
            recurringConcerns: stat.concerns.slice(0, 3),
            recommendedFocus: this.getRecommendationForDimension(criterion),
          });
        }
      }
    }

    // Sort by lowest average score first
    recurringWeaknesses.sort((a, b) => a.averageScore - b.averageScore);

    return {
      learnerId,
      totalEvaluatedAttempts: evaluated.length,
      recurringWeaknesses,
    };
  }

  private getRecommendationForDimension(dimension: RubricDimension): string {
    switch (dimension) {
      case 'requirementUnderstanding':
        return 'Review problem requirements carefully to ensure all core domain concepts and entities are explicitly covered.';
      case 'classResponsibilities':
        return 'Apply the Single Responsibility Principle strictly. Break down large coordinator classes with excessive methods into smaller cohesive collaborators.';
      case 'couplingCohesion':
        return 'Eliminate orphan entities by explicitly establishing has-a, is-a, or uses relationships in your domain graph.';
      case 'encapsulationInterfaces':
        return 'Avoid anemic domain models. Place behavioral logic and state mutations directly inside entities rather than treating them as passive data holders.';
      case 'abstractionPatterns':
        return 'Introduce abstract interfaces or polymorphism for declared extension axes (e.g. strategy patterns for algorithms or pricing).';
      case 'extensibility':
        return 'Detail how new features can be added without modifying existing code (Open/Closed Principle).';
      case 'edgeCasesTestability':
        return 'Document explicit assumptions, concurrency boundaries, and failure scenarios.';
      case 'explanationQuality':
        return 'Provide deep engineering rationale for tradeoffs: contrast your decision with specific alternatives and explain the operational costs.';
    }
  }
}
