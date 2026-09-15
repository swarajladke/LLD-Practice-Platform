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

describe('Express API Endpoints', () => {
  let server: Server;
  let baseUrl: string;

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
    const attemptRepo = new InMemoryAttemptRepository();
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

  it('GET /api/problems lists all seeded problems', async () => {
    const res = await fetch(`${baseUrl}/api/problems`);
    expect(res.status).toBe(200);
    const problems = await res.json();
    expect(problems).toHaveLength(4);
    expect(problems.some((p: any) => p.id === 'parking-lot')).toBe(true);
  });

  it('GET /api/problems/:id returns specific problem details', async () => {
    const res = await fetch(`${baseUrl}/api/problems/parking-lot`);
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.id).toBe('parking-lot');
    expect(p.requirements.length).toBeGreaterThan(0);
    expect(p.rubric.expectedConcepts).toContain('ParkingLot');
  });

  it('POST /api/attempts creates submission and polls report', async () => {
    const submitRes = await fetch(`${baseUrl}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        learnerId: 'learner-api-1',
        problemId: 'parking-lot',
        formatId: 'structured-text',
        rawSubmission: validSubmission,
        idempotencyKey: 'api-key-1',
      }),
    });

    expect(submitRes.status).toBe(201);
    const submitData = await submitRes.json();
    expect(submitData.attemptId).toBeDefined();
    expect(submitData.isExisting).toBe(false);

    // Poll until evaluated (in-process evaluation runs promptly)
    let status = '';
    let attemptsCount = 0;
    while (status !== 'EVALUATED' && attemptsCount < 20) {
      await new Promise((r) => setTimeout(r, 50));
      const statusRes = await fetch(`${baseUrl}/api/attempts/${submitData.attemptId}`);
      const statusData = await statusRes.json();
      status = statusData.status;
      attemptsCount++;
    }

    expect(status).toBe('EVALUATED');

    // Retrieve report
    const reportRes = await fetch(`${baseUrl}/api/attempts/${submitData.attemptId}/report`);
    expect(reportRes.status).toBe(200);
    const report = await reportRes.json();
    expect(report.dimensionResults).toHaveLength(8);
    expect(report.overallScore).toBeGreaterThan(0);
  });

  it('GET /api/learners/:learnerId/problems/:problemId/history returns history with deltas', async () => {
    const res = await fetch(`${baseUrl}/api/learners/learner-api-1/problems/parking-lot/history`);
    expect(res.status).toBe(200);
    const history = await res.json();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  it('GET /api/learners/:learnerId/weaknesses returns learner weakness summary', async () => {
    const res = await fetch(`${baseUrl}/api/learners/learner-api-1/weaknesses`);
    expect(res.status).toBe(200);
    const summary = await res.json();
    expect(summary.learnerId).toBe('learner-api-1');
    expect(summary.totalEvaluatedAttempts).toBeGreaterThan(0);
  });
});
