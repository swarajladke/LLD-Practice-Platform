import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Attempt } from '../../src/domain/models/Attempt.js';
import { DuplicateIdempotencyKeyError } from '../../src/domain/errors/DomainErrors.js';
import { quoteRef } from '../../src/domain/models/Evidence.js';
import { InMemoryAttemptRepository } from '../../src/infrastructure/repositories/InMemoryAttemptRepository.js';
import { SqliteAttemptRepository } from '../../src/infrastructure/repositories/SqliteAttemptRepository.js';
import type { AttemptRepository } from '../../src/domain/interfaces/AttemptRepository.js';

describe.each([
  {
    name: 'InMemoryAttemptRepository',
    createRepo: () => new InMemoryAttemptRepository(),
  },
  {
    name: 'SqliteAttemptRepository',
    createRepo: () => new SqliteAttemptRepository(new Database(':memory:')),
  },
])('$name', ({ createRepo }) => {
  let repo: AttemptRepository;

  beforeEach(() => {
    repo = createRepo();
  });

  it('saves and retrieves an attempt by id', async () => {
    const attempt = Attempt.createSubmitted({
      id: 'att-1',
      problemId: 'parking-lot',
      learnerId: 'learner-1',
      formatId: 'structured-text',
      rawSubmission: { text: 'parking lot' },
      idempotencyKey: 'idemp-1',
    });

    await repo.save(attempt);
    const retrieved = await repo.findById('att-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('att-1');
    expect(retrieved?.status).toBe('SUBMITTED');
    expect(retrieved?.idempotencyKey).toBe('idemp-1');
  });

  it('retrieves an attempt by idempotency key', async () => {
    const attempt = Attempt.createSubmitted({
      id: 'att-2',
      problemId: 'elevator',
      learnerId: 'learner-alice',
      formatId: 'structured-text',
      rawSubmission: {},
      idempotencyKey: 'alice-key-1',
    });

    await repo.save(attempt);
    const found = await repo.findByIdempotencyKey('learner-alice', 'alice-key-1');

    expect(found).not.toBeNull();
    expect(found?.id).toBe('att-2');
  });

  it('rejects duplicate idempotency key for the same learner', async () => {
    const attempt1 = Attempt.createSubmitted({
      id: 'att-10',
      problemId: 'parking-lot',
      learnerId: 'learner-bob',
      formatId: 'structured-text',
      rawSubmission: { v: 1 },
      idempotencyKey: 'bob-key-1',
    });

    await repo.save(attempt1);

    const attempt2 = Attempt.createSubmitted({
      id: 'att-11',
      problemId: 'parking-lot',
      learnerId: 'learner-bob',
      formatId: 'structured-text',
      rawSubmission: { v: 2 },
      idempotencyKey: 'bob-key-1',
    });

    await expect(repo.save(attempt2)).rejects.toThrow(DuplicateIdempotencyKeyError);
  });

  it('allows same idempotency key across DIFFERENT learners', async () => {
    const attempt1 = Attempt.createSubmitted({
      id: 'att-c1',
      problemId: 'parking-lot',
      learnerId: 'learner-carol',
      formatId: 'structured-text',
      rawSubmission: {},
      idempotencyKey: 'shared-key',
    });

    const attempt2 = Attempt.createSubmitted({
      id: 'att-d1',
      problemId: 'parking-lot',
      learnerId: 'learner-dave',
      formatId: 'structured-text',
      rawSubmission: {},
      idempotencyKey: 'shared-key',
    });

    await repo.save(attempt1);
    await expect(repo.save(attempt2)).resolves.not.toThrow();
  });

  it('persists state transitions and preserves EvaluationReport and Evidence', async () => {
    const attempt = Attempt.createSubmitted({
      id: 'att-lifecycle',
      problemId: 'parking-lot',
      learnerId: 'learner-eve',
      formatId: 'structured-text',
      rawSubmission: { entities: [] },
      idempotencyKey: 'eve-key-1',
    });

    await repo.save(attempt);

    attempt.beginEvaluation({
      assumptions: [],
      entities: [
        {
          name: 'Gate',
          responsibility: 'Opens on payment',
          attributes: ['isOpen'],
          methods: ['open', 'close'],
        },
      ],
      relationships: [],
      interfaces: [],
      tradeoffs: [
        { decision: 'D1', alternative: 'A1', why: 'W1' },
        { decision: 'D2', alternative: 'A2', why: 'W2' },
      ],
      extensibility: 'Extensible',
    });

    await repo.save(attempt);

    attempt.completeWith({
      attemptId: 'att-lifecycle',
      rubricVersion: '1.0.0',
      evaluatorsRun: ['rule-engine'],
      evaluatorsFailed: [],
      overallScore: 4.5,
      summary: 'Solid implementation',
      degraded: false,
      evaluatedAt: new Date().toISOString(),
      dimensionResults: [
        {
          criterion: 'encapsulationInterfaces',
          score: 4,
          findings: [
            {
              evidenceRef: quoteRef('isOpen', 'entities[0].attributes[0]'),
              concern: 'Direct attribute access',
              suggestion: 'Encapsulate gate status behind a sensor interface',
            },
          ],
          confidence: 0.95,
          evaluatorId: 'rule-engine',
        },
      ],
    });

    await repo.save(attempt);

    const rehydrated = await repo.findById('att-lifecycle');
    expect(rehydrated).not.toBeNull();
    expect(rehydrated?.status).toBe('EVALUATED');
    expect(rehydrated?.report?.rubricVersion).toBe('1.0.0');
    expect(rehydrated?.report?.evaluatorsRun).toEqual(['rule-engine']);
    const finding = rehydrated?.report?.dimensionResults[0].findings[0];
    expect(finding?.evidenceRef.kind).toBe('quote');
    if (finding?.evidenceRef.kind === 'quote') {
      expect(finding.evidenceRef.evidence.quote).toBe('isOpen');
      expect(finding.evidenceRef.evidence.sourcePath).toBe('entities[0].attributes[0]');
    }
  });
});
