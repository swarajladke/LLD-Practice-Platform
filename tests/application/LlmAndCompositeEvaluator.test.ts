import { describe, it, expect, beforeEach } from 'vitest';
import { LlmEvaluator } from '../../src/application/evaluators/LlmEvaluator.js';
import { DeterministicEvaluator } from '../../src/application/evaluators/DeterministicEvaluator.js';
import { CompositeEvaluator } from '../../src/application/evaluators/CompositeEvaluator.js';
import { EvaluationReportAssembler } from '../../src/application/evaluators/EvaluationReportAssembler.js';
import { FakeLlmClient } from '../../src/infrastructure/llm/FakeLlmClient.js';
import { FixedClock } from '../../src/domain/services/Clock.js';
import { Evidence } from '../../src/domain/models/Evidence.js';
import { Rubric, type RubricDimension } from '../../src/domain/models/Rubric.js';
import { EvaluationFailedError } from '../../src/domain/errors/DomainErrors.js';
import type { Problem } from '../../src/domain/models/Problem.js';
import type { DesignSpec } from '../../src/domain/models/DesignSpec.js';
import type { EvaluationContext } from '../../src/domain/interfaces/Evaluator.js';

const weights: Record<RubricDimension, number> = {
  requirementUnderstanding: 0.15,
  classResponsibilities: 0.20,
  couplingCohesion: 0.15,
  encapsulationInterfaces: 0.10,
  abstractionPatterns: 0.10,
  extensibility: 0.10,
  edgeCasesTestability: 0.10,
  explanationQuality: 0.10,
};

const rubric = Rubric.create({
  rubricVersion: '1.0.0',
  expectedConcepts: ['Spot', 'Vehicle', 'Ticket'],
  extensionAxes: ['PricingStrategy'],
  minEntities: 3,
  minTradeoffs: 2,
  dimensionWeights: weights,
});

const problem: Problem = {
  id: 'parking-lot',
  title: 'Parking Lot',
  description: 'Design a parking lot management system',
  requirements: ['Park vehicles', 'Issue tickets', 'Collect payments'],
  clarifyingContext: ['Single building'],
  rubric,
};

const sampleSpec: DesignSpec = {
  assumptions: ['Single level lot', 'Max 500 spots'],
  entities: [
    {
      name: 'ParkingLot',
      responsibility: 'Coordinates spot allocation across floors',
      attributes: ['spots'],
      methods: ['parkVehicle', 'vacateSpot'],
    },
    {
      name: 'Spot',
      responsibility: 'Tracks occupancy of a single physical space',
      attributes: ['isOccupied', 'spotType'],
      methods: ['occupy', 'vacate'],
    },
    {
      name: 'Ticket',
      responsibility: 'Represents entry timestamp and assigned spot for a vehicle',
      attributes: ['id', 'entryTime', 'spotId'],
      methods: ['calculateDuration', 'markPaid'],
    },
  ],
  relationships: [
    { from: 'ParkingLot', to: 'Spot', type: 'has-a', note: 'Lot contains spots' },
    { from: 'ParkingLot', to: 'Ticket', type: 'uses', note: 'Lot issues tickets' },
  ],
  interfaces: [
    {
      name: 'PricingStrategy',
      purpose: 'Enables flexible hourly or flat pricing schemes',
      methods: ['calculateFee(ticket: Ticket): number'],
    },
  ],
  tradeoffs: [
    {
      decision: 'In-memory array for spots',
      alternative: 'Database queried each spot lookup',
      why: 'Spot lookup is ultra low latency and capacity fits easily into memory.',
    },
    {
      decision: 'Separation of PricingStrategy interface',
      alternative: 'Hardcoding hourly fee calculations inside Ticket',
      why: 'Allows adding weekend rates or VIP discounts without modifying ticket logic.',
    },
  ],
  extensibility: 'Can easily add new vehicle types and pricing strategies by implementing interfaces without changing core domain.',
};

describe('LlmEvaluator & CompositeEvaluator Integration', () => {
  let fakeLlm: FakeLlmClient;
  let llmEvaluator: LlmEvaluator;
  let deterministicEvaluator: DeterministicEvaluator;
  let assembler: EvaluationReportAssembler;
  let fixedClock: FixedClock;
  let ctx: EvaluationContext;

  beforeEach(() => {
    fakeLlm = new FakeLlmClient();
    llmEvaluator = new LlmEvaluator(fakeLlm);
    deterministicEvaluator = new DeterministicEvaluator();
    fixedClock = new FixedClock('2026-09-15T12:00:00.000Z');
    assembler = new EvaluationReportAssembler(fixedClock);
    ctx = {
      attemptId: 'test-attempt-1',
      spec: sampleSpec,
      problem,
      rubric,
    };
  });

  describe('Statelessness & Concurrent Evaluations on ONE CompositeEvaluator', () => {
    it('executes two concurrent evaluations on the same instance where one LLM fails and other succeeds', async () => {
      const conditionalLlmEvaluator = {
        id: 'llm',
        supports: () => true,
        evaluate: async (context: EvaluationContext) => {
          if (context.attemptId === 'fail-attempt') {
            throw new Error('LLM rate limit / timeout on context A');
          }
          return [
            {
              criterion: 'classResponsibilities' as const,
              score: 4.0,
              confidence: 0.85,
              findings: [
                {
                  evidenceRef: {
                    kind: 'quote' as const,
                    evidence: Evidence.create('parkVehicle', 'entities[0].methods[0]'),
                  },
                  concern: 'Minor coupling',
                  suggestion: 'Extract strategy',
                  evaluatorId: 'llm',
                },
              ],
              evaluatorIds: ['llm'],
            },
          ];
        },
      };

      const sharedComposite = new CompositeEvaluator([
        deterministicEvaluator,
        conditionalLlmEvaluator,
      ]);

      const ctxA: EvaluationContext = {
        attemptId: 'fail-attempt',
        spec: sampleSpec,
        problem,
        rubric,
      };

      const ctxB: EvaluationContext = {
        attemptId: 'success-attempt',
        spec: sampleSpec,
        problem,
        rubric,
      };

      // Run concurrently on the SAME shared instance
      const [resA, resB] = await Promise.all([
        sharedComposite.evaluate(ctxA),
        sharedComposite.evaluate(ctxB),
      ]);

      const reportA = assembler.assemble({
        attemptId: ctxA.attemptId,
        rubric,
        results: resA.results,
        provenance: resA.provenance,
      });

      const reportB = assembler.assemble({
        attemptId: ctxB.attemptId,
        rubric,
        results: resB.results,
        provenance: resB.provenance,
      });

      // Context A must be degraded
      expect(reportA.degraded).toBe(true);
      expect(reportA.evaluatorsFailed.length).toBeGreaterThan(0);
      expect(reportA.evaluatorsRun).toEqual(['deterministic']);

      // Context B must NOT be degraded
      expect(reportB.degraded).toBe(false);
      expect(reportB.evaluatorsFailed).toEqual([]);
      expect(reportB.evaluatorsRun).toEqual(['deterministic', 'llm']);
    });
  });

  describe('LlmEvaluator parsing and validation', () => {
    it('successfully parses valid structured JSON response and produces DimensionResult[] with quoteRef', async () => {
      fakeLlm.setResponse(
        JSON.stringify({
          dimensions: [
            {
              criterion: 'classResponsibilities',
              score: 4.5,
              confidence: 0.9,
              findings: [
                {
                  quote: 'Coordinates spot allocation across floors',
                  sourcePath: 'entities[0].responsibility',
                  concern: 'Could separate spot search from coordinator.',
                  suggestion: 'Extract SpotAllocationStrategy class.',
                },
              ],
            },
          ],
          overallSummary: 'Strong cohesion with clean single responsibilities.',
        })
      );

      const results = await llmEvaluator.evaluate(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].criterion).toBe('classResponsibilities');
      expect(results[0].score).toBe(4.5);
      expect(results[0].confidence).toBe(0.9);
      expect(results[0].evaluatorIds).toEqual(['llm']);
      expect(results[0].findings[0].evaluatorId).toBe('llm');
      expect(results[0].findings[0].evidenceRef.kind).toBe('quote');
    });

    it('throws error when LLM output is malformed non-JSON', async () => {
      fakeLlm.setResponse('This is not json at all { unclosed bracket');
      await expect(llmEvaluator.evaluate(ctx)).rejects.toThrow(/LLM returned invalid JSON/);
    });

    it('throws error when LLM output fails Zod schema validation', async () => {
      fakeLlm.setResponse(
        JSON.stringify({
          dimensions: [
            {
              criterion: 'classResponsibilities',
              score: 99.0,
              confidence: 0.9,
              findings: [],
            },
          ],
          overallSummary: 'Done',
        })
      );
      await expect(llmEvaluator.evaluate(ctx)).rejects.toThrow();
    });
  });

  describe('CompositeEvaluator & EvaluationReportAssembler', () => {
    it('merges overlapping dimensions by confidence-weighted average score and confidence', async () => {
      fakeLlm.setResponse(
        JSON.stringify({
          dimensions: [
            {
              criterion: 'classResponsibilities',
              score: 3.0,
              confidence: 0.7,
              findings: [
                {
                  quote: 'parkVehicle',
                  sourcePath: 'entities[0].methods[0]',
                  concern: 'Parking logic could be decoupled.',
                  suggestion: 'Use a parking strategy.',
                },
              ],
            },
          ],
          overallSummary: 'Good start.',
        })
      );

      const composite = new CompositeEvaluator([deterministicEvaluator, llmEvaluator]);
      const { results, provenance } = await composite.evaluate(ctx);

      expect(provenance.evaluatorsRun).toEqual(['deterministic', 'llm']);
      expect(provenance.evaluatorsFailed).toEqual([]);
      expect(provenance.evaluatorsSkipped).toEqual([]);

      const classResp = results.find((r) => r.criterion === 'classResponsibilities')!;
      expect(classResp.score).toBe(4.1);
      expect(classResp.confidence).toBe(0.81);
      expect(classResp.evaluatorIds).toContain('deterministic');
      expect(classResp.evaluatorIds).toContain('llm');

      const report = assembler.assemble({
        attemptId: ctx.attemptId,
        rubric,
        results,
        provenance,
      });

      expect(report.degraded).toBe(false);
      expect(report.overallScoreComparable).toBe(true);
      expect(report.dimensionsMissing).toHaveLength(0);
      expect(report.summary).toMatch(/^Complete evaluation completed/);
      expect(report.evaluatedAt).toBe('2026-09-15T12:00:00.000Z');
    });

    it('handles timeout when FakeLlmClient never resolves, producing degraded report', async () => {
      fakeLlm.setNeverResolve(true);

      const composite = new CompositeEvaluator([deterministicEvaluator, llmEvaluator], {
        timeoutMs: 50,
      });
      const { results, provenance } = await composite.evaluate(ctx);

      expect(provenance.evaluatorsRun).toEqual(['deterministic']);
      expect(provenance.evaluatorsFailed.some((f) => f.includes('timed out'))).toBe(true);

      const report = assembler.assemble({
        attemptId: ctx.attemptId,
        rubric,
        results,
        provenance,
      });

      expect(report.degraded).toBe(true);
      expect(report.summary).toMatch(/^Partial evaluation completed \(degraded mode\)/);
    });

    it('records evaluatorsSkipped and marks degraded=true when an evaluator does not support context', async () => {
      const unsupportedLlm = new LlmEvaluator(fakeLlm, 'unsupported-llm', () => false);

      const composite = new CompositeEvaluator([deterministicEvaluator, unsupportedLlm]);
      const { results, provenance } = await composite.evaluate(ctx);

      expect(provenance.evaluatorsSkipped).toEqual(['unsupported-llm']);
      expect(provenance.evaluatorsRun).toEqual(['deterministic']);

      const report = assembler.assemble({
        attemptId: ctx.attemptId,
        rubric,
        results,
        provenance,
      });

      expect(report.degraded).toBe(true);
      expect(report.summary).not.toMatch(/^Complete evaluation/);
      expect(report.summary).toMatch(/Skipped: \[unsupported-llm\]/);
    });

    it('nests a CompositeEvaluator inside another CompositeEvaluator cleanly', async () => {
      const innerComposite = new CompositeEvaluator([deterministicEvaluator], { id: 'inner-composite' });
      const outerComposite = new CompositeEvaluator([innerComposite, llmEvaluator], { id: 'outer-composite' });

      fakeLlm.setResponse(
        JSON.stringify({
          dimensions: [],
          overallSummary: 'Empty dimensions',
        })
      );

      const { results, provenance } = await outerComposite.evaluate(ctx);
      expect(results).toHaveLength(8);
      expect(provenance.evaluatorsRun).toContain('inner-composite');
      expect(provenance.evaluatorsRun).toContain('llm');
    });

    it('throws EvaluationFailedError when all active evaluators throw', async () => {
      fakeLlm.setError(new Error('LLM fatal failure'));
      const brokenEvaluator = {
        id: 'broken',
        supports: () => true,
        evaluate: async () => {
          throw new Error('Fatal rule failure');
        },
      };

      const composite = new CompositeEvaluator([brokenEvaluator, llmEvaluator]);
      await expect(composite.evaluate(ctx)).rejects.toThrow(EvaluationFailedError);
    });
  });
});
