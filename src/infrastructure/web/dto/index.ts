import type { Problem } from '../../../domain/models/Problem.js';
import type { Attempt } from '../../../domain/models/Attempt.js';
import type { EvaluationReport, FailedEvaluatorInfo } from '../../../domain/models/EvaluationReport.js';

export interface ProblemDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requirements: readonly string[];
  readonly clarifyingContext: readonly string[];
  readonly extensionAxes: readonly string[];
}

export function toProblemDto(problem: Problem): ProblemDto {
  return {
    id: problem.id,
    title: problem.title,
    description: problem.description,
    requirements: problem.requirements,
    clarifyingContext: problem.clarifyingContext,
    extensionAxes: problem.rubric.extensionAxes,
  };
}

export interface AttemptDto {
  readonly id: string;
  readonly problemId: string;
  readonly learnerId: string;
  readonly formatId: string;
  readonly status: string;
  readonly degraded: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly errorMessage?: string;
}

export function toAttemptDto(attempt: Attempt): AttemptDto {
  return {
    id: attempt.id,
    problemId: attempt.problemId,
    learnerId: attempt.learnerId,
    formatId: attempt.formatId,
    status: attempt.status,
    degraded: attempt.degraded,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    errorMessage: attempt.errorMessage,
  };
}

export interface ReportDto {
  readonly attemptId: string;
  readonly rubricVersion: string;
  readonly evaluatorsRun: readonly string[];
  readonly evaluatorsFailed: readonly FailedEvaluatorInfo[];
  readonly evaluatorsSkipped: readonly string[];
  readonly dimensionsMissing: readonly string[];
  readonly overallScoreComparable: boolean;
  readonly overallScore: number;
  readonly summary: string;
  readonly degraded: boolean;
  readonly evaluatedAt: string;
  readonly dimensionResults: readonly {
    readonly criterion: string;
    readonly score: number;
    readonly confidence: number;
    readonly evaluatorIds: readonly string[];
    readonly findings: readonly {
      readonly evidenceRef: {
        readonly kind: 'quote' | 'absence';
        readonly quote?: string;
        readonly sourcePath?: string;
        readonly expectedPath?: string;
        readonly note?: string;
      };
      readonly concern: string;
      readonly suggestion: string;
      readonly evaluatorId: string;
    }[];
  }[];
}

export function toReportDto(report: EvaluationReport): ReportDto {
  return {
    attemptId: report.attemptId,
    rubricVersion: report.rubricVersion,
    evaluatorsRun: report.evaluatorsRun,
    evaluatorsFailed: report.evaluatorsFailed,
    evaluatorsSkipped: report.evaluatorsSkipped,
    dimensionsMissing: report.dimensionsMissing,
    overallScoreComparable: report.overallScoreComparable,
    overallScore: report.overallScore,
    summary: report.summary,
    degraded: report.degraded,
    evaluatedAt: report.evaluatedAt,
    dimensionResults: report.dimensionResults.map((dr) => ({
      criterion: dr.criterion,
      score: dr.score,
      confidence: dr.confidence,
      evaluatorIds: dr.evaluatorIds,
      findings: dr.findings.map((f) => ({
        concern: f.concern,
        suggestion: f.suggestion,
        evaluatorId: f.evaluatorId,
        evidenceRef:
          f.evidenceRef.kind === 'quote'
            ? {
                kind: 'quote',
                quote: f.evidenceRef.evidence.quote,
                sourcePath: f.evidenceRef.evidence.sourcePath,
              }
            : {
                kind: 'absence',
                expectedPath: f.evidenceRef.expectedPath,
                note: f.evidenceRef.note,
              },
      })),
    })),
  };
}
