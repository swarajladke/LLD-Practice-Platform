import { describe, it, expect, beforeEach } from 'vitest';
import { StructuredTextFormat } from '../../src/infrastructure/formats/StructuredTextFormat.js';
import { InMemoryAttemptRepository } from '../../src/infrastructure/repositories/InMemoryAttemptRepository.js';
import { InMemoryProblemRepository } from '../../src/infrastructure/repositories/InMemoryProblemRepository.js';
import { DeterministicEvaluator } from '../../src/application/evaluators/DeterministicEvaluator.js';
import { CompositeEvaluator } from '../../src/application/evaluators/CompositeEvaluator.js';
import { EvaluationReportAssembler } from '../../src/application/evaluators/EvaluationReportAssembler.js';
import { EvaluationService } from '../../src/application/services/EvaluationService.js';
import { LearningLoopService } from '../../src/application/services/LearningLoopService.js';
import { Attempt } from '../../src/domain/models/Attempt.js';
import { quoteRef } from '../../src/domain/models/Evidence.js';
import { FixedClock } from '../../src/domain/services/Clock.js';
import { IdempotencyPayloadMismatchError } from '../../src/domain/errors/DomainErrors.js';
import type { EvaluationReport } from '../../src/domain/models/EvaluationReport.js';

const validRawSpec = {
  assumptions: ['Single lot'],
  entities: [
    {
      name: 'Lot',
      responsibility: 'Coordinates spots',
      attributes: ['spots'],
      methods: ['park'],
    },
    {
      name: 'Spot',
      responsibility: 'Occupancy state',
      attributes: ['isFree'],
      methods: ['occupy'],
    },
  ],
  relationships: [{ from: 'Lot', to: 'Spot', type: 'has-a' }],
  interfaces: [{ name: 'IPricing', purpose: 'Calculates fees', methods: ['fee'] }],
  tradeoffs: [
    { decision: 'Array', alternative: 'Map', why: 'Direct indexing is faster' },
    { decision: 'Locks', alternative: 'Atomic', why: 'Easier to reason about' },
  ],
  extensibility: 'Can add new floors easily by nesting collections',
};

describe('StructuredTextFormat Validation', () => {
  const format = new StructuredTextFormat();

  it('accepts valid structured text submission', () => {
    const result = format.parseAndValidate(validRawSpec);
    expect(result.success).toBe(true);
    expect(result.spec?.entities).toHaveLength(2);
  });

  it('rejects empty, non-object or whitespace-only submission with useful messages', () => {
    expect(format.parseAndValidate(null).success).toBe(false);
    expect(format.parseAndValidate({}).success).toBe(false);

    const emptyEntities = {
      ...validRawSpec,
      entities: [],
    };
    const res = format.parseAndValidate(emptyEntities);
    expect(res.success).toBe(false);
    expect(res.errors?.some((e) => e.message.includes('At least 1 entity'))).toBe(true);

    const missingTradeoffs = {
      ...validRawSpec,
      tradeoffs: [validRawSpec.tradeoffs[0]],
    };
    const res2 = format.parseAndValidate(missingTradeoffs);
    expect(res2.success).toBe(false);
    expect(res2.errors?.some((e) => e.message.includes('At least 2 tradeoffs'))).toBe(true);

    const blankExtensibility = {
      ...validRawSpec,
      extensibility: '   ',
    };
    const res3 = format.parseAndValidate(blankExtensibility);
    expect(res3.success).toBe(false);
    expect(res3.errors?.some((e) => e.path === 'extensibility')).toBe(true);
  });

  it('rejects oversized submissions exceeding maximum payload limit', () => {
    const oversizedSpec = {
      ...validRawSpec,
      extensibility: 'A'.repeat(120_000),
    };
    const res = format.parseAndValidate(oversizedSpec);
    expect(res.success).toBe(false);
    expect(res.errors?.[0].message).toMatch(/Payload exceeds maximum allowable size/);
  });
});

describe('EvaluationService & Idempotency', () => {
  let attemptRepo: InMemoryAttemptRepository;
  let problemRepo: InMemoryProblemRepository;
  let service: EvaluationService;
  let fixedClock: FixedClock;

  beforeEach(() => {
    attemptRepo = new InMemoryAttemptRepository();
    problemRepo = new InMemoryProblemRepository();
    fixedClock = new FixedClock('2026-09-15T12:00:00.000Z');

    const formats = new Map();
    const format = new StructuredTextFormat();
    formats.set(format.formatId, format);

    const detEval = new DeterministicEvaluator();
    const composite = new CompositeEvaluator([detEval]);
    const assembler = new EvaluationReportAssembler(fixedClock);

    service = new EvaluationService(
      attemptRepo,
      problemRepo,
      formats,
      composite,
      assembler,
      fixedClock
    );
  });

  it('idempotent resubmission creates no duplicate evaluation and returns existing attempt', async () => {
    const req = {
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: validRawSpec,
      idempotencyKey: 'idemp-duplicate-test',
    };

    const firstResult = await service.submitAttempt(req);
    expect(firstResult.outcome).toBe('accepted');
    if (firstResult.outcome === 'accepted') {
      expect(firstResult.isReplay).toBe(false);
      expect(firstResult.attemptId).toBeDefined();

      const secondResult = await service.submitAttempt(req);
      expect(secondResult.outcome).toBe('accepted');
      if (secondResult.outcome === 'accepted') {
        expect(secondResult.isReplay).toBe(true);
        expect(secondResult.attemptId).toBe(firstResult.attemptId);
      }
    }

    const attempts = await attemptRepo.listByLearner('learner-1');
    expect(attempts).toHaveLength(1);
  });

  it('throws IdempotencyPayloadMismatchError when idempotency key is reused with modified payload', async () => {
    const key = 'shared-idemp-key';
    await service.submitAttempt({
      problemId: 'parking-lot',
      learnerId: 'learner-alice',
      rawSubmission: validRawSpec,
      idempotencyKey: key,
    });

    const modifiedSpec = {
      ...validRawSpec,
      assumptions: ['Different assumption'],
    };

    await expect(
      service.submitAttempt({
        problemId: 'parking-lot',
        learnerId: 'learner-alice',
        rawSubmission: modifiedSpec,
        idempotencyKey: key,
      })
    ).rejects.toThrow(IdempotencyPayloadMismatchError);
  });

  it('recovers stale evaluating attempts using recoverStaleEvaluations with FixedClock', async () => {
    // Submit attempt at 12:00:00
    const submitResult = await service.submitAttempt({
      problemId: 'parking-lot',
      learnerId: 'learner-stale',
      rawSubmission: validRawSpec,
      idempotencyKey: 'stale-key',
    });

    expect(submitResult.outcome).toBe('accepted');
    if (submitResult.outcome !== 'accepted') return;

    // Simulate in-flight EVALUATING state that got stuck
    const attempt = await attemptRepo.findById(submitResult.attemptId);
    expect(attempt).not.toBeNull();

    // Advance clock past deadline (30,000ms deadline -> advance 60,000ms)
    fixedClock.setTime('2026-09-15T12:01:00.000Z');

    // Run sweep
    const recovered = await service.recoverStaleEvaluations(30000);
    expect(recovered).toBe(1);

    const recoveredAttempt = await attemptRepo.findById(submitResult.attemptId);
    expect(recoveredAttempt?.status).toBe('FAILED');
    expect(recoveredAttempt?.errorMessage).toMatch(/recovered by stale-evaluation sweep/);
  });
});

describe('LearningLoopService History Deltas & Recurring Weaknesses', () => {
  const learningLoop = new LearningLoopService();

  function makeEvaluatedAttempt(
    id: string,
    scores: { classResp: number; reqUnder: number; coupling: number }
  ): Attempt {
    const report: EvaluationReport = {
      attemptId: id,
      rubricVersion: '1.0.0',
      evaluatorsRun: ['deterministic'],
      evaluatorsFailed: [],
      evaluatorsSkipped: [],
      dimensionsMissing: [],
      overallScoreComparable: true,
      overallScore: (scores.classResp + scores.reqUnder + scores.coupling) / 3,
      summary: 'Eval',
      degraded: false,
      evaluatedAt: new Date().toISOString(),
      dimensionResults: [
        {
          criterion: 'classResponsibilities',
          score: scores.classResp,
          findings: [
            {
              evidenceRef: quoteRef('GodClass', 'entities[0].name'),
              concern: 'God class detected with too many methods',
              suggestion: 'Split into smaller classes',
              evaluatorId: 'deterministic',
            },
          ],
          confidence: 0.9,
          evaluatorIds: ['deterministic'],
        },
        {
          criterion: 'requirementUnderstanding',
          score: scores.reqUnder,
          findings: [],
          confidence: 0.9,
          evaluatorIds: ['deterministic'],
        },
        {
          criterion: 'couplingCohesion',
          score: scores.coupling,
          findings: [
            {
              evidenceRef: quoteRef('Orphan', 'entities[1].name'),
              concern: 'Orphan entity with no links',
              suggestion: 'Connect entity',
              evaluatorId: 'deterministic',
            },
          ],
          confidence: 0.9,
          evaluatorIds: ['deterministic'],
        },
      ],
    };

    const att = Attempt.createSubmitted({
      id,
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: {},
      idempotencyKey: `key-${id}`,
    });
    att.beginEvaluation(validRawSpec as any);
    att.completeWith(report);
    return att;
  }

  it('computes correct score deltas between consecutive attempts', () => {
    const att1 = makeEvaluatedAttempt('att-1', { classResp: 2.0, reqUnder: 4.0, coupling: 3.0 });
    const att2 = makeEvaluatedAttempt('att-2', { classResp: 3.5, reqUnder: 4.0, coupling: 2.5 });

    const deltas = learningLoop.computeDeltas(att1, att2);
    const classDelta = deltas.find((d) => d.criterion === 'classResponsibilities')!;
    const reqDelta = deltas.find((d) => d.criterion === 'requirementUnderstanding')!;
    const couplingDelta = deltas.find((d) => d.criterion === 'couplingCohesion')!;

    expect(classDelta.delta).toBe(1.5);
    expect(reqDelta.delta).toBe(0.0);
    expect(couplingDelta.delta).toBe(-0.5);
  });

  it('aggregates recurring weaknesses across 3 attempts and identifies lowest dimensions', () => {
    const att1 = makeEvaluatedAttempt('att-1', { classResp: 2.0, reqUnder: 5.0, coupling: 2.5 });
    const att2 = makeEvaluatedAttempt('att-2', { classResp: 2.5, reqUnder: 5.0, coupling: 3.0 });
    const att3 = makeEvaluatedAttempt('att-3', { classResp: 2.0, reqUnder: 5.0, coupling: 3.5 });

    const summary = learningLoop.computeWeaknesses('learner-1', [att1, att2, att3]);

    expect(summary.totalEvaluatedAttempts).toBe(3);
    expect(summary.recurringWeaknesses.length).toBeGreaterThanOrEqual(1);

    const lowest = summary.recurringWeaknesses[0];
    expect(lowest.criterion).toBe('classResponsibilities');
    expect(lowest.averageScore).toBeLessThan(3.0);
    expect(lowest.recurringConcerns.length).toBeGreaterThan(0);
    expect(lowest.recommendedFocus).toContain('Single Responsibility Principle');

    const reqWeakness = summary.recurringWeaknesses.find((w) => w.criterion === 'requirementUnderstanding');
    expect(reqWeakness).toBeUndefined();
  });
});
