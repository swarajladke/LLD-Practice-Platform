import { describe, it, expect, beforeEach } from 'vitest';
import { LlmEvaluator } from '../../src/application/evaluators/LlmEvaluator.js';
import { DeterministicEvaluator } from '../../src/application/evaluators/DeterministicEvaluator.js';
import { CompositeEvaluator } from '../../src/application/evaluators/CompositeEvaluator.js';
import { FakeLlmClient } from '../../src/infrastructure/llm/FakeLlmClient.js';
import { Rubric, type RubricDimension } from '../../src/domain/models/Rubric.js';
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
  let ctx: EvaluationContext;

  beforeEach(() => {
    fakeLlm = new FakeLlmClient();
    llmEvaluator = new LlmEvaluator(fakeLlm);
    deterministicEvaluator = new DeterministicEvaluator();
    ctx = {
      attemptId: 'test-attempt-1',
      spec: sampleSpec,
      problem,
      rubric,
    };
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
      expect(results[0].findings).toHaveLength(1);
      expect(results[0].findings[0].evidenceRef.kind).toBe('quote');
      if (results[0].findings[0].evidenceRef.kind === 'quote') {
        expect(results[0].findings[0].evidenceRef.evidence.quote).toBe(
          'Coordinates spot allocation across floors'
        );
      }
    });

    it('throws error when LLM output is malformed non-JSON', async () => {
      fakeLlm.setResponse('This is not json at all { unclosed bracket');

      await expect(llmEvaluator.evaluate(ctx)).rejects.toThrow(/LLM returned invalid JSON/);
    });

    it('throws error when LLM output fails Zod schema validation (e.g. invalid score or missing quote)', async () => {
      fakeLlm.setResponse(
        JSON.stringify({
          dimensions: [
            {
              criterion: 'classResponsibilities',
              score: 99.0, // Invalid score > 5
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

  describe('CompositeEvaluator aggregation and degradation', () => {
    it('merges overlapping dimensions by confidence-weighted score when all evaluators succeed', async () => {
      // Deterministic produces score 5.0 with confidence 0.9 for classResponsibilities
      // We set LLM to produce score 3.0 with confidence 0.9 for classResponsibilities
      fakeLlm.setResponse(
        JSON.stringify({
          dimensions: [
            {
              criterion: 'classResponsibilities',
              score: 3.0,
              confidence: 0.9,
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
      const report = await composite.evaluate(ctx);

      expect(report.evaluatorsRun).toEqual(['deterministic', 'llm']);
      expect(report.evaluatorsFailed).toEqual([]);
      expect(report.degraded).toBe(false);

      // classResponsibilities merged score: (5.0*0.9 + 3.0*0.9) / (0.9 + 0.9) = 4.0
      const classResp = report.dimensionResults.find((r) => r.criterion === 'classResponsibilities')!;
      expect(classResp.score).toBe(4.0);
      expect(classResp.evaluatorId).toBe('composite(deterministic+llm)');
      // Findings from both are accumulated
      expect(classResp.findings.length).toBeGreaterThanOrEqual(1);
    });

    it('survives thrown LLM error and returns degraded report with deterministic results', async () => {
      fakeLlm.setError(new Error('503 Service Unavailable / Connection timeout'));

      const composite = new CompositeEvaluator([deterministicEvaluator, llmEvaluator]);
      const report = await composite.evaluate(ctx);

      expect(report.degraded).toBe(true);
      expect(report.evaluatorsRun).toEqual(['deterministic']);
      expect(report.evaluatorsFailed).toEqual(['llm']);
      // Still produced all 8 dimensions from deterministic evaluator
      expect(report.dimensionResults).toHaveLength(8);
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.summary).toMatch(/degraded mode/);
    });

    it('survives malformed LLM JSON and returns degraded report without crashing', async () => {
      fakeLlm.setResponse('<<<MALFORMED LLM OUTPUT>>>');

      const composite = new CompositeEvaluator([deterministicEvaluator, llmEvaluator]);
      const report = await composite.evaluate(ctx);

      expect(report.degraded).toBe(true);
      expect(report.evaluatorsRun).toEqual(['deterministic']);
      expect(report.evaluatorsFailed).toEqual(['llm']);
      expect(report.dimensionResults).toHaveLength(8);
    });

    it('throws error when all registered evaluators fail', async () => {
      fakeLlm.setError(new Error('LLM failed'));
      const brokenEvaluator = {
        id: 'broken',
        supports: () => true,
        evaluate: async () => {
          throw new Error('Broken evaluator');
        },
      };

      const composite = new CompositeEvaluator([brokenEvaluator, llmEvaluator]);
      await expect(composite.evaluate(ctx)).rejects.toThrow(/All registered evaluators failed/);
    });
  });
});
