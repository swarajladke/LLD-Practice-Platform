import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../../src/infrastructure/web/app.js';
import { InMemoryAttemptRepository } from '../../src/infrastructure/repositories/InMemoryAttemptRepository.js';
import { InMemoryProblemRepository } from '../../src/infrastructure/repositories/InMemoryProblemRepository.js';
import { StructuredTextFormat } from '../../src/infrastructure/formats/StructuredTextFormat.js';
import { DeterministicEvaluator } from '../../src/application/evaluators/DeterministicEvaluator.js';
import { CompositeEvaluator } from '../../src/application/evaluators/CompositeEvaluator.js';
import { EvaluationReportAssembler } from '../../src/application/evaluators/EvaluationReportAssembler.js';
import { EvaluationService } from '../../src/application/services/EvaluationService.js';
import { LearningLoopService } from '../../src/application/services/LearningLoopService.js';
import { Attempt } from '../../src/domain/models/Attempt.js';

describe('Express API Endpoints & Error Mapping Middleware', () => {
  let server: Server;
  let baseUrl: string;
  let attemptRepo: InMemoryAttemptRepository;

  const validSubmission = {
    assumptions: ['Single lot'],
    entities: [
      {
        name: 'ParkingLot',
        responsibility: 'Coordinates spots',
        attributes: ['spots'],
        methods: ['parkVehicle'],
      },
      {
        name: 'Spot',
        responsibility: 'Occupancy state',
        attributes: ['isFree'],
        methods: ['occupy'],
      },
      {
        name: 'Ticket',
        responsibility: 'Entry receipt',
        attributes: ['id'],
        methods: ['validate'],
      },
    ],
    relationships: [
      { from: 'ParkingLot', to: 'Spot', type: 'has-a' },
      { from: 'ParkingLot', to: 'Ticket', type: 'uses' },
    ],
    interfaces: [{ name: 'PricingStrategy', purpose: 'Calculates fees', methods: ['fee'] }],
    tradeoffs: [
      { decision: 'Array', alternative: 'Map', why: 'Direct indexing is faster in small lots' },
      { decision: 'Locks', alternative: 'Atomic', why: 'Easier to reason about critical sections' },
    ],
    extensibility: 'Can add new vehicle types and pricing schemes without modifying existing classes',
  };

  beforeAll(async () => {
    attemptRepo = new InMemoryAttemptRepository();
    const problemRepo = new InMemoryProblemRepository();

    const formats = new Map();
    const structuredFormat = new StructuredTextFormat();
    formats.set(structuredFormat.formatId, structuredFormat);

    const detEval = new DeterministicEvaluator();
    const composite = new CompositeEvaluator([detEval]);
    const assembler = new EvaluationReportAssembler();

    const evaluationService = new EvaluationService(
      attemptRepo,
      problemRepo,
      formats,
      composite,
      assembler
    );
    const learningLoopService = new LearningLoopService();

    const app = createApp({
      problemRepo,
      attemptRepo,
      evaluationService,
      learningLoopService,
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (typeof address === 'object' && address !== null) {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Problem DTO Boundary', () => {
    it('GET /api/problems/:id exposes requirements and extensionAxes but NO rubric internals', async () => {
      const res = await fetch(`${baseUrl}/api/problems/parking-lot`);
      expect(res.status).toBe(200);
      const problem = await res.json();

      // Expected public fields
      expect(problem.id).toBe('parking-lot');
      expect(problem.title).toBeDefined();
      expect(problem.description).toBeDefined();
      expect(Array.isArray(problem.requirements)).toBe(true);
      expect(Array.isArray(problem.clarifyingContext)).toBe(true);
      expect(Array.isArray(problem.extensionAxes)).toBe(true);

      // Rubric internals MUST NOT BE EXPOSED
      expect(problem.rubric).toBeUndefined();
      expect(problem.expectedConcepts).toBeUndefined();
      expect(problem.minEntities).toBeUndefined();
      expect(problem.minTradeoffs).toBeUndefined();
      expect(problem.dimensionWeights).toBeUndefined();
      expect(problem.godClassMethodThreshold).toBeUndefined();
      expect(problem.minRationaleLength).toBeUndefined();
    });
  });

  describe('Report Status Code Contract', () => {
    it('returns 202 while in SUBMITTED or EVALUATING status', async () => {
      const pendingAttempt = Attempt.createSubmitted({
        id: 'att-pending-test',
        problemId: 'parking-lot',
        learnerId: 'learner-p',
        formatId: 'structured-text',
        rawSubmission: validSubmission,
        idempotencyKey: 'pending-key',
      });
      await attemptRepo.save(pendingAttempt);

      const res = await fetch(`${baseUrl}/api/attempts/att-pending-test/report`);
      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.status).toBe('SUBMITTED');
    });

    it('returns 409 with errorMessage when attempt is in FAILED status', async () => {
      const failedAttempt = Attempt.createSubmitted({
        id: 'att-failed-test',
        problemId: 'parking-lot',
        learnerId: 'learner-f',
        formatId: 'structured-text',
        rawSubmission: validSubmission,
        idempotencyKey: 'failed-key',
      });
      failedAttempt.fail('Evaluator crashed during analysis');
      await attemptRepo.save(failedAttempt);

      const res = await fetch(`${baseUrl}/api/attempts/att-failed-test/report`);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.status).toBe('FAILED');
      expect(data.errorMessage).toBe('Evaluator crashed during analysis');
    });

    it('returns 200 with ReportDto when attempt is in EVALUATED status', async () => {
      const submitRes = await fetch(`${baseUrl}/api/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learnerId: 'learner-eval-200',
          problemId: 'parking-lot',
          formatId: 'structured-text',
          rawSubmission: validSubmission,
          idempotencyKey: 'key-eval-200',
        }),
      });

      const { attemptId } = await submitRes.json();

      let status = '';
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const statusRes = await fetch(`${baseUrl}/api/attempts/${attemptId}`);
        const statusData = await statusRes.json();
        status = statusData.status;
        if (status === 'EVALUATED') break;
      }

      expect(status).toBe('EVALUATED');

      const reportRes = await fetch(`${baseUrl}/api/attempts/${attemptId}/report`);
      expect(reportRes.status).toBe(200);
      const report = await reportRes.json();
      expect(report.overallScore).toBeDefined();
      expect(report.dimensionResults.length).toBe(8);
    });
  });

  describe('Typed Domain Error Mapping Middleware', () => {
    it('maps ProblemNotFoundError to 404', async () => {
      const res = await fetch(`${baseUrl}/api/problems/non-existent-problem`);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toMatch(/Problem 'non-existent-problem' not found/);
    });

    it('maps UnsupportedFormatError to 400', async () => {
      const res = await fetch(`${baseUrl}/api/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learnerId: 'learner-1',
          problemId: 'parking-lot',
          formatId: 'unsupported-format-xyz',
          rawSubmission: validSubmission,
          idempotencyKey: 'bad-format-key',
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Unsupported submission format/);
    });

    it('maps ValidationFailedError to 422', async () => {
      // Missing required field (learnerId)
      const res = await fetch(`${baseUrl}/api/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: 'parking-lot',
          rawSubmission: validSubmission,
          idempotencyKey: 'missing-fields-key',
        }),
      });
      expect(res.status).toBe(422);
    });

    it('maps IdempotencyPayloadMismatchError to 409', async () => {
      const key = 'payload-mismatch-api-key';
      // First submission
      await fetch(`${baseUrl}/api/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learnerId: 'learner-mismatch',
          problemId: 'parking-lot',
          rawSubmission: validSubmission,
          idempotencyKey: key,
        }),
      });

      // Second submission with modified payload and same key
      const res = await fetch(`${baseUrl}/api/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learnerId: 'learner-mismatch',
          problemId: 'parking-lot',
          rawSubmission: { ...validSubmission, assumptions: ['Different'] },
          idempotencyKey: key,
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/previously used with a different submission payload/);
    });
  });
});
