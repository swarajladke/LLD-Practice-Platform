import Database from 'better-sqlite3';
import { DuplicateIdempotencyKeyError } from '../../domain/errors/DomainErrors.js';
import type { AttemptRepository } from '../../domain/interfaces/AttemptRepository.js';
import {
  Attempt,
  type AttemptState,
  type AttemptStatus,
} from '../../domain/models/Attempt.js';
import { Evidence } from '../../domain/models/Evidence.js';
import type { EvaluationReport } from '../../domain/models/EvaluationReport.js';

interface AttemptRow {
  id: string;
  problem_id: string;
  learner_id: string;
  format_id: string;
  status: AttemptStatus;
  idempotency_key: string | null;
  raw_submission: string;
  spec: string | null;
  report: string | null;
  error_message: string | null;
  degraded: number;
  created_at: string;
  updated_at: string;
}

export class SqliteAttemptRepository implements AttemptRepository {
  private readonly db: Database.Database;

  constructor(dbOrPath: Database.Database | string) {
    if (typeof dbOrPath === 'string') {
      this.db = new Database(dbOrPath);
    } else {
      this.db = dbOrPath;
    }
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY,
        problem_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        format_id TEXT NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT,
        raw_submission TEXT NOT NULL,
        spec TEXT,
        report TEXT,
        error_message TEXT,
        degraded INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (learner_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_attempts_learner ON attempts(learner_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_learner_problem ON attempts(learner_id, problem_id);
    `);
  }

  async save(attempt: Attempt): Promise<void> {
    const serializedRaw = JSON.stringify(attempt.rawSubmission);
    const serializedSpec = attempt.spec ? JSON.stringify(attempt.spec) : null;
    const serializedReport = attempt.report ? JSON.stringify(attempt.report) : null;
    const idempotencyKey = attempt.idempotencyKey ?? null;
    const errorMessage = attempt.errorMessage ?? null;
    const degraded = attempt.degraded ? 1 : 0;

    const stmt = this.db.prepare(`
      INSERT INTO attempts (
        id, problem_id, learner_id, format_id, status,
        idempotency_key, raw_submission, spec, report,
        error_message, degraded, created_at, updated_at
      ) VALUES (
        @id, @problem_id, @learner_id, @format_id, @status,
        @idempotency_key, @raw_submission, @spec, @report,
        @error_message, @degraded, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        idempotency_key = excluded.idempotency_key,
        raw_submission = excluded.raw_submission,
        spec = excluded.spec,
        report = excluded.report,
        error_message = excluded.error_message,
        degraded = excluded.degraded,
        updated_at = excluded.updated_at
    `);

    try {
      stmt.run({
        id: attempt.id,
        problem_id: attempt.problemId,
        learner_id: attempt.learnerId,
        format_id: attempt.formatId,
        status: attempt.status,
        idempotency_key: idempotencyKey,
        raw_submission: serializedRaw,
        spec: serializedSpec,
        report: serializedReport,
        error_message: errorMessage,
        degraded,
        created_at: attempt.createdAt,
        updated_at: attempt.updatedAt,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('UNIQUE constraint failed: attempts.learner_id, attempts.idempotency_key')) {
        throw new DuplicateIdempotencyKeyError(attempt.learnerId, idempotencyKey ?? '');
      }
      throw err;
    }
  }

  async findById(id: string): Promise<Attempt | null> {
    const stmt = this.db.prepare('SELECT * FROM attempts WHERE id = ?');
    const row = stmt.get(id) as AttemptRow | undefined;
    if (!row) return null;
    return this.rowToAttempt(row);
  }

  async findByIdempotencyKey(learnerId: string, key: string): Promise<Attempt | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM attempts WHERE learner_id = ? AND idempotency_key = ?'
    );
    const row = stmt.get(learnerId, key) as AttemptRow | undefined;
    if (!row) return null;
    return this.rowToAttempt(row);
  }

  async findByLearnerAndProblem(learnerId: string, problemId: string): Promise<readonly Attempt[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM attempts WHERE learner_id = ? AND problem_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(learnerId, problemId) as AttemptRow[];
    return rows.map((r) => this.rowToAttempt(r));
  }

  async listByLearner(learnerId: string): Promise<readonly Attempt[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM attempts WHERE learner_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(learnerId) as AttemptRow[];
    return rows.map((r) => this.rowToAttempt(r));
  }

  private rowToAttempt(row: AttemptRow): Attempt {
    const rawSubmission = JSON.parse(row.raw_submission);
    const spec = row.spec ? JSON.parse(row.spec) : undefined;
    let report: EvaluationReport | undefined;

    if (row.report) {
      const parsedReport = JSON.parse(row.report);
      // Reconstitute Evidence instances inside dimensionResults
      report = {
        attemptId: parsedReport.attemptId,
        rubricVersion: parsedReport.rubricVersion,
        overallScore: parsedReport.overallScore,
        summary: parsedReport.summary,
        degraded: Boolean(parsedReport.degraded),
        evaluatedAt: parsedReport.evaluatedAt,
        dimensionResults: (parsedReport.dimensionResults ?? []).map((dr: {
          criterion: any;
          score: number;
          evidence: { quote: string; sourcePath: string };
          concern?: string;
          suggestion: string;
          confidence: number;
          evaluatorId: string;
        }) => ({
          criterion: dr.criterion,
          score: dr.score,
          evidence: Evidence.create(dr.evidence.quote, dr.evidence.sourcePath),
          concern: dr.concern,
          suggestion: dr.suggestion,
          confidence: dr.confidence,
          evaluatorId: dr.evaluatorId,
        })),
      };
    }

    let state: AttemptState;
    switch (row.status) {
      case 'DRAFT':
        state = {
          status: 'DRAFT',
          rawSubmission,
          formatId: row.format_id,
          spec,
        };
        break;
      case 'SUBMITTED':
        state = {
          status: 'SUBMITTED',
          rawSubmission,
          formatId: row.format_id,
          idempotencyKey: row.idempotency_key ?? '',
          spec,
        };
        break;
      case 'EVALUATING':
        state = {
          status: 'EVALUATING',
          rawSubmission,
          formatId: row.format_id,
          idempotencyKey: row.idempotency_key ?? '',
          spec: spec!,
        };
        break;
      case 'EVALUATED':
        state = {
          status: 'EVALUATED',
          rawSubmission,
          formatId: row.format_id,
          idempotencyKey: row.idempotency_key ?? '',
          spec: spec!,
          report: report!,
          degraded: row.degraded === 1,
        };
        break;
      case 'FAILED':
        state = {
          status: 'FAILED',
          rawSubmission,
          formatId: row.format_id,
          idempotencyKey: row.idempotency_key ?? '',
          spec,
          errorMessage: row.error_message ?? 'Unknown error',
        };
        break;
    }

    return Attempt.rehydrate({
      id: row.id,
      problemId: row.problem_id,
      learnerId: row.learner_id,
      state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  close(): void {
    this.db.close();
  }
}
