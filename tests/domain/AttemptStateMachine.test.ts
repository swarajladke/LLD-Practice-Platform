import { describe, it, expect } from 'vitest';
import { Attempt } from '../../src/domain/models/Attempt.js';
import { IllegalTransitionError } from '../../src/domain/errors/DomainErrors.js';
import { Evidence } from '../../src/domain/models/Evidence.js';
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

const sampleReport: EvaluationReport = {
  attemptId: 'att-1',
  rubricVersion: '1.0.0',
  dimensionResults: [
    {
      criterion: 'classResponsibilities',
      score: 4,
      evidence: Evidence.create('Coordinates spot allocation', 'entities[0].responsibility'),
      suggestion: 'Separate spot allocation strategy from lot management.',
      confidence: 0.9,
      evaluatorId: 'deterministic',
    },
  ],
  overallScore: 4.0,
  summary: 'Good separation of concerns.',
  degraded: false,
  evaluatedAt: new Date().toISOString(),
};

describe('Attempt State Machine & Invariants', () => {
  it('enforces that a valid lifecycle succeeds', () => {
    const attempt = Attempt.createDraft({
      id: 'att-1',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: { text: 'parking lot design' },
    });

    expect(attempt.status).toBe('DRAFT');
    expect(attempt.report).toBeUndefined();
    expect(attempt.errorMessage).toBeUndefined();

    // DRAFT -> SUBMITTED
    attempt.submit('idemp-key-1', sampleSpec);
    expect(attempt.status).toBe('SUBMITTED');
    expect(attempt.idempotencyKey).toBe('idemp-key-1');

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

  it('supports degraded completion when fallback evaluation is used', () => {
    const attempt = Attempt.createSubmitted({
      id: 'att-2',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: {},
      idempotencyKey: 'idemp-key-2',
      spec: sampleSpec,
    });

    attempt.beginEvaluation(sampleSpec);
    attempt.degradeWith({ ...sampleReport, degraded: true });

    expect(attempt.status).toBe('EVALUATED');
    expect(attempt.degraded).toBe(true);
    expect(attempt.report).toBeDefined();
  });

  it('supports transition to FAILED with error message', () => {
    const attempt = Attempt.createSubmitted({
      id: 'att-3',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: {},
      idempotencyKey: 'idemp-key-3',
      spec: sampleSpec,
    });

    attempt.beginEvaluation(sampleSpec);
    attempt.fail('Evaluator timed out');

    expect(attempt.status).toBe('FAILED');
    expect(attempt.errorMessage).toBe('Evaluator timed out');
    expect(attempt.report).toBeUndefined();
  });

  it('rejects submit without a valid non-empty idempotencyKey', () => {
    const attempt = Attempt.createDraft({
      id: 'att-4',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: {},
    });

    expect(() => attempt.submit('')).toThrow(/idempotencyKey is required/);
    expect(() => attempt.submit('   ')).toThrow(/idempotencyKey is required/);
  });

  describe('Illegal Transitions Throws IllegalTransitionError', () => {
    it('rejects illegal transitions from DRAFT', () => {
      const draft = Attempt.createDraft({
        id: 'att-draft',
        problemId: 'parking-lot',
        learnerId: 'learner-1',
        formatId: 'structured-text',
        rawSubmission: {},
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
