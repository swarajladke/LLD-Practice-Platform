import { describe, it, expect } from 'vitest';
import { Attempt } from '../../src/domain/models/Attempt.js';
import {
  CorruptAttemptStateError,
  IllegalTransitionError,
} from '../../src/domain/errors/DomainErrors.js';
import { quoteRef } from '../../src/domain/models/Evidence.js';
import { FixedClock } from '../../src/domain/services/Clock.js';
import type { DesignSpec } from '../../src/domain/models/DesignSpec.js';
import type { EvaluationReport } from '../../src/domain/models/EvaluationReport.js';

const sampleSpec: DesignSpec = {
  assumptions: ['Single level lot'],
  entities: [
    {
      name: 'ParkingLot',
      responsibility: 'Coordinates spot allocation',
      attributes: ['spots'],
      methods: ['parkVehicle', 'vacateSpot'],
    },
  ],
  relationships: [],
  interfaces: [],
  tradeoffs: [
    { decision: 'Array of spots', alternative: 'Map of spots', why: 'Simple contiguous indexing' },
    { decision: 'In-memory locks', alternative: 'Distributed lock', why: 'Single node requirement' },
  ],
  extensibility: 'Can add multi-floor support by nesting floors',
};

const fixedClock = new FixedClock('2026-09-15T12:00:00.000Z');

const sampleReport: EvaluationReport = {
  attemptId: 'att-1',
  rubricVersion: '1.0.0',
  evaluatorsRun: ['deterministic'],
  evaluatorsFailed: [],
  evaluatorsSkipped: [],
  dimensionsMissing: [],
  overallScoreComparable: true,
  dimensionResults: [
    {
      criterion: 'classResponsibilities',
      score: 4,
      findings: [
        {
          evidenceRef: quoteRef('Coordinates spot allocation', 'entities[0].responsibility'),
          concern: 'Slight coupling with allocation strategy.',
          suggestion: 'Separate spot allocation strategy from lot management.',
          evaluatorId: 'deterministic',
        },
      ],
      confidence: 0.9,
      evaluatorIds: ['deterministic'],
    },
  ],
  overallScore: 4.0,
  summary: 'Good separation of concerns.',
  degraded: false,
  evaluatedAt: fixedClock.now(),
};

describe('Attempt State Machine & Invariants', () => {
  it('enforces that a valid lifecycle succeeds using FixedClock', () => {
    const attempt = Attempt.createDraft({
      id: 'att-1',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: { text: 'parking lot design' },
      clock: fixedClock,
    });

    expect(attempt.status).toBe('DRAFT');
    expect(attempt.createdAt).toBe('2026-09-15T12:00:00.000Z');
    expect(attempt.updatedAt).toBe('2026-09-15T12:00:00.000Z');
    expect(attempt.report).toBeUndefined();
    expect(attempt.errorMessage).toBeUndefined();

    // Advance clock
    fixedClock.setTime('2026-09-15T12:05:00.000Z');

    // DRAFT -> SUBMITTED
    attempt.submit('idemp-key-1', sampleSpec);
    expect(attempt.status).toBe('SUBMITTED');
    expect(attempt.idempotencyKey).toBe('idemp-key-1');
    expect(attempt.updatedAt).toBe('2026-09-15T12:05:00.000Z');

    // SUBMITTED -> EVALUATING
    attempt.beginEvaluation(sampleSpec);
    expect(attempt.status).toBe('EVALUATING');
    expect(attempt.report).toBeUndefined();

    // EVALUATING -> EVALUATED
    attempt.completeWith(sampleReport);
    expect(attempt.status).toBe('EVALUATED');
    expect(attempt.report).toBeDefined();
    expect(attempt.report?.overallScore).toBe(4.0);
    expect(attempt.degraded).toBe(false);
    expect(attempt.errorMessage).toBeUndefined();
  });

  it('rejects completeWith(degradedReport) to prevent false healthy states', () => {
    const attempt = Attempt.createSubmitted({
      id: 'att-degrade-check',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: {},
      idempotencyKey: 'key-deg-1',
      spec: sampleSpec,
      clock: fixedClock,
    });

    attempt.beginEvaluation(sampleSpec);

    const degradedReport: EvaluationReport = {
      ...sampleReport,
      degraded: true,
      evaluatorsFailed: [{ id: 'llm', reason: 'Timeout' }],
    };

    expect(() => attempt.completeWith(degradedReport)).toThrow(
      /Cannot complete with a degraded report via completeWith/
    );

    attempt.degradeWith(degradedReport);
    expect(attempt.status).toBe('EVALUATED');
    expect(attempt.degraded).toBe(true);
  });

  it('rejects degradeWith(healthyReport)', () => {
    const attempt = Attempt.createSubmitted({
      id: 'att-healthy-check',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: {},
      idempotencyKey: 'key-healthy-1',
      spec: sampleSpec,
      clock: fixedClock,
    });

    attempt.beginEvaluation(sampleSpec);

    expect(() => attempt.degradeWith(sampleReport)).toThrow(
      /degradeWith requires a report with degraded=true/
    );
  });

  it('supports transition to FAILED with error message and preserved idempotencyKey', () => {
    const attempt = Attempt.createSubmitted({
      id: 'att-3',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: {},
      idempotencyKey: 'idemp-key-3',
      spec: sampleSpec,
      clock: fixedClock,
    });

    attempt.beginEvaluation(sampleSpec);
    attempt.fail('Evaluator timed out');

    expect(attempt.status).toBe('FAILED');
    expect(attempt.errorMessage).toBe('Evaluator timed out');
    expect(attempt.idempotencyKey).toBe('idemp-key-3');
    expect(attempt.report).toBeUndefined();
  });

  it('rejects submit without a valid non-empty idempotencyKey', () => {
    const attempt = Attempt.createDraft({
      id: 'att-4',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: {},
      clock: fixedClock,
    });

    expect(() => attempt.submit('')).toThrow(/idempotencyKey is required/);
    expect(() => attempt.submit('   ')).toThrow(/idempotencyKey is required/);
  });

  describe('Rehydration & Corrupt State Validation', () => {
    it('throws CorruptAttemptStateError if required fields are missing on rehydration', () => {
      // EVALUATED without report
      expect(() =>
        Attempt.rehydrate({
          id: 'corrupt-1',
          problemId: 'parking-lot',
          learnerId: 'learner-1',
          state: {
            status: 'EVALUATED',
            rawSubmission: {},
            formatId: 'structured-text',
            idempotencyKey: 'key-1',
            spec: sampleSpec,
            report: null as any,
          },
          createdAt: '2026-09-15T12:00:00.000Z',
          updatedAt: '2026-09-15T12:00:00.000Z',
        })
      ).toThrow(CorruptAttemptStateError);

      // SUBMITTED without idempotencyKey
      expect(() =>
        Attempt.rehydrate({
          id: 'corrupt-2',
          problemId: 'parking-lot',
          learnerId: 'learner-1',
          state: {
            status: 'SUBMITTED',
            rawSubmission: {},
            formatId: 'structured-text',
            idempotencyKey: '',
          },
          createdAt: '2026-09-15T12:00:00.000Z',
          updatedAt: '2026-09-15T12:00:00.000Z',
        })
      ).toThrow(CorruptAttemptStateError);

      // FAILED without errorMessage
      expect(() =>
        Attempt.rehydrate({
          id: 'corrupt-3',
          problemId: 'parking-lot',
          learnerId: 'learner-1',
          state: {
            status: 'FAILED',
            rawSubmission: {},
            formatId: 'structured-text',
            idempotencyKey: 'key-1',
            errorMessage: '   ',
          },
          createdAt: '2026-09-15T12:00:00.000Z',
          updatedAt: '2026-09-15T12:00:00.000Z',
        })
      ).toThrow(CorruptAttemptStateError);
    });
  });

  describe('Illegal Transitions Throws IllegalTransitionError', () => {
    it('rejects illegal transitions from DRAFT', () => {
      const draft = Attempt.createDraft({
        id: 'att-draft',
        problemId: 'parking-lot',
        learnerId: 'learner-1',
        formatId: 'structured-text',
        rawSubmission: {},
        clock: fixedClock,
      });

      expect(() => draft.beginEvaluation(sampleSpec)).toThrow(IllegalTransitionError);
      expect(() => draft.completeWith(sampleReport)).toThrow(IllegalTransitionError);
      expect(() => draft.degradeWith(sampleReport)).toThrow(IllegalTransitionError);
      expect(() => draft.fail('Failed')).toThrow(IllegalTransitionError);
    });

    it('rejects illegal transitions from SUBMITTED', () => {
      const submitted = Attempt.createSubmitted({
        id: 'att-sub',
        problemId: 'parking-lot',
        learnerId: 'learner-1',
        formatId: 'structured-text',
        rawSubmission: {},
        idempotencyKey: 'key-123',
        clock: fixedClock,
      });

      expect(() => submitted.submit('another-key')).toThrow(IllegalTransitionError);
      expect(() => submitted.completeWith(sampleReport)).toThrow(IllegalTransitionError);
      expect(() => submitted.degradeWith(sampleReport)).toThrow(IllegalTransitionError);
    });

    it('rejects illegal transitions from EVALUATING', () => {
      const evaluating = Attempt.createSubmitted({
        id: 'att-eval',
        problemId: 'parking-lot',
        learnerId: 'learner-1',
        formatId: 'structured-text',
        rawSubmission: {},
        idempotencyKey: 'key-123',
        clock: fixedClock,
      });
      evaluating.beginEvaluation(sampleSpec);

      expect(() => evaluating.submit('new-key')).toThrow(IllegalTransitionError);
      expect(() => evaluating.beginEvaluation(sampleSpec)).toThrow(IllegalTransitionError);
    });

    it('rejects illegal transitions from EVALUATED', () => {
      const evaluated = Attempt.createSubmitted({
        id: 'att-done',
        problemId: 'parking-lot',
        learnerId: 'learner-1',
        formatId: 'structured-text',
        rawSubmission: {},
        idempotencyKey: 'key-123',
        clock: fixedClock,
      });
      evaluated.beginEvaluation(sampleSpec);
      evaluated.completeWith(sampleReport);

      expect(() => evaluated.submit('key-2')).toThrow(IllegalTransitionError);
      expect(() => evaluated.beginEvaluation(sampleSpec)).toThrow(IllegalTransitionError);
      expect(() => evaluated.completeWith(sampleReport)).toThrow(IllegalTransitionError);
      expect(() => evaluated.degradeWith(sampleReport)).toThrow(IllegalTransitionError);
      expect(() => evaluated.fail('Late failure')).toThrow(IllegalTransitionError);
    });

    it('rejects illegal transitions from FAILED', () => {
      const failed = Attempt.createSubmitted({
        id: 'att-failed',
        problemId: 'parking-lot',
        learnerId: 'learner-1',
        formatId: 'structured-text',
        rawSubmission: {},
        idempotencyKey: 'key-123',
        clock: fixedClock,
      });
      failed.beginEvaluation(sampleSpec);
      failed.fail('Fatal error');

      expect(() => failed.submit('key-3')).toThrow(IllegalTransitionError);
      expect(() => failed.beginEvaluation(sampleSpec)).toThrow(IllegalTransitionError);
      expect(() => failed.completeWith(sampleReport)).toThrow(IllegalTransitionError);
      expect(() => failed.degradeWith(sampleReport)).toThrow(IllegalTransitionError);
      expect(() => failed.fail('Another fail')).toThrow(IllegalTransitionError);
    });
  });
});
