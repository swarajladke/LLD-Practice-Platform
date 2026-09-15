import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicEvaluator } from '../../src/application/evaluators/DeterministicEvaluator.js';
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

const baseRubric = Rubric.create({
  rubricVersion: '1.0.0',
  expectedConcepts: ['Spot', 'Vehicle', 'Ticket'],
  extensionAxes: ['PricingStrategy'],
  minEntities: 3,
  minTradeoffs: 2,
  dimensionWeights: weights,
  godClassMethodThreshold: 5,
  minRationaleLength: 15,
  minExtensibilityLength: 20,
});

const baseProblem: Problem = {
  id: 'parking-lot',
  title: 'Parking Lot',
  description: 'Design a parking lot management system',
  requirements: ['Park vehicles', 'Issue tickets', 'Collect payments'],
  clarifyingContext: ['Single building'],
  rubric: baseRubric,
};

const healthySpec: DesignSpec = {
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

describe('DeterministicEvaluator Heuristics & Multi-Finding Collection', () => {
  let evaluator: DeterministicEvaluator;

  beforeEach(() => {
    evaluator = new DeterministicEvaluator();
  });

  it('evaluates healthy submission with high scores and zero negative findings', async () => {
    const ctx: EvaluationContext = {
      attemptId: 'healthy-attempt',
      spec: healthySpec,
      problem: baseProblem,
      rubric: baseRubric,
    };

    const results = await evaluator.evaluate(ctx);
    expect(results).toHaveLength(8);

    for (const res of results) {
      expect(res.score).toBe(5);
      expect(res.findings).toHaveLength(0);
      expect(res.evaluatorId).toBe('deterministic');
    }
  });

  it('handles completely empty spec with minEntities=0 without throwing', async () => {
    const zeroEntityRubric = Rubric.create({
      rubricVersion: '1.0.0',
      expectedConcepts: [],
      extensionAxes: [],
      minEntities: 0,
      minTradeoffs: 0,
      dimensionWeights: weights,
    });

    const emptySpec: DesignSpec = {
      assumptions: [],
      entities: [],
      relationships: [],
      interfaces: [],
      tradeoffs: [],
      extensibility: '',
    };

    await expect(
      evaluator.evaluate({
        attemptId: 'empty-attempt',
        spec: emptySpec,
        problem: { ...baseProblem, rubric: zeroEntityRubric },
        rubric: zeroEntityRubric,
      })
    ).resolves.not.toThrow();
  });

  it('asserts that a missing tradeoff lowers exactly one dimension (explanationQuality)', async () => {
    const missingTradeoffSpec: DesignSpec = {
      ...healthySpec,
      tradeoffs: [healthySpec.tradeoffs[0]], // 1 tradeoff instead of 2
    };

    const results = await evaluator.evaluate({
      attemptId: 'one-tradeoff-attempt',
      spec: missingTradeoffSpec,
      problem: baseProblem,
      rubric: baseRubric,
    });

    const reqUnder = results.find((r) => r.criterion === 'requirementUnderstanding')!;
    const expQual = results.find((r) => r.criterion === 'explanationQuality')!;

    // requirementUnderstanding must NOT be penalized for missing tradeoff
    expect(reqUnder.score).toBe(5);
    expect(reqUnder.findings).toHaveLength(0);

    // explanationQuality MUST be penalized
    expect(expQual.score).toBeLessThan(5);
    expect(expQual.findings.some((f) => f.concern.includes('Rubric requires at least 2 tradeoffs'))).toBe(true);
  });

  describe('Multi-Finding Collection (asserting all violations are reported)', () => {
    it('reports ALL violating entities when multiple entities violate god-class heuristic', async () => {
      const multiGodClassSpec: DesignSpec = {
        ...healthySpec,
        entities: [
          {
            name: 'GodA',
            responsibility: 'Manages lots and handles payments',
            attributes: [],
            methods: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], // > 5 methods
          },
          {
            name: 'GodB',
            responsibility: 'Coordinates cars and prints tickets',
            attributes: [],
            methods: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'], // > 5 methods
          },
          healthySpec.entities[2],
        ],
      };

      const results = await evaluator.evaluate({
        attemptId: 'multi-god-attempt',
        spec: multiGodClassSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const classResp = results.find((r) => r.criterion === 'classResponsibilities')!;
      // Both GodA and GodB must appear in findings
      expect(classResp.findings.length).toBeGreaterThanOrEqual(2);
      const reportedEntities = classResp.findings.map((f) => f.concern);
      expect(reportedEntities.some((c) => c.includes('GodA'))).toBe(true);
      expect(reportedEntities.some((c) => c.includes('GodB'))).toBe(true);
    });

    it('reports ALL anemic entities when multiple entities have state but 0 methods', async () => {
      const multiAnemicSpec: DesignSpec = {
        ...healthySpec,
        entities: [
          healthySpec.entities[0],
          {
            name: 'AnemicSpot',
            responsibility: 'Data spot',
            attributes: ['id', 'floor'],
            methods: [],
          },
          {
            name: 'AnemicTicket',
            responsibility: 'Data ticket',
            attributes: ['code', 'time'],
            methods: [],
          },
        ],
      };

      const results = await evaluator.evaluate({
        attemptId: 'multi-anemic-attempt',
        spec: multiAnemicSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const encap = results.find((r) => r.criterion === 'encapsulationInterfaces')!;
      expect(encap.findings.length).toBe(2);
      expect(encap.findings.some((f) => f.concern.includes('AnemicSpot'))).toBe(true);
      expect(encap.findings.some((f) => f.concern.includes('AnemicTicket'))).toBe(true);
      expect(encap.score).toBe(2); // 5 - 2*1.5 = 2.0
    });
  });

  describe('Missing Abstraction Heuristic', () => {
    it('triggers missing abstraction and records absence evidence when extension axis is uncovered', async () => {
      const missingAbsSpec: DesignSpec = {
        ...healthySpec,
        interfaces: [],
      };

      const results = await evaluator.evaluate({
        attemptId: 'missing-abs-attempt',
        spec: missingAbsSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const absResult = results.find((r) => r.criterion === 'abstractionPatterns')!;
      expect(absResult.score).toBeLessThan(5);
      expect(absResult.findings).toHaveLength(1);
      expect(absResult.findings[0].evidenceRef.kind).toBe('absence');
      expect(absResult.findings[0].concern).toMatch(/Missing abstraction for declared extension axis: 'PricingStrategy'/);
    });

    it('does not trigger missing abstraction when interface covers the extension axis', async () => {
      const results = await evaluator.evaluate({
        attemptId: 'healthy-abs-attempt',
        spec: healthySpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const absResult = results.find((r) => r.criterion === 'abstractionPatterns')!;
      expect(absResult.score).toBe(5);
      expect(absResult.findings).toHaveLength(0);
    });
  });

  describe('Orphan Entity Heuristic', () => {
    it('triggers orphan entity with honest quote evidence', async () => {
      const orphanSpec: DesignSpec = {
        ...healthySpec,
        entities: [
          ...healthySpec.entities,
          {
            name: 'AuditLogger',
            responsibility: 'Logs events to disk',
            attributes: ['logPath'],
            methods: ['log'],
          },
        ],
      };

      const results = await evaluator.evaluate({
        attemptId: 'orphan-attempt',
        spec: orphanSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const coupling = results.find((r) => r.criterion === 'couplingCohesion')!;
      expect(coupling.findings).toHaveLength(1);
      expect(coupling.findings[0].evidenceRef.kind).toBe('quote');
      if (coupling.findings[0].evidenceRef.kind === 'quote') {
        expect(coupling.findings[0].evidenceRef.evidence.quote).toBe('AuditLogger');
        expect(coupling.findings[0].evidenceRef.evidence.sourcePath).toBe('entities[3].name');
      }
    });
  });

  describe('Concept Coverage with Stemming & Tradeoffs Inclusion', () => {
    it('recognizes pluralized concepts in tradeoffs/extensibility corpus', async () => {
      const pluralSpec: DesignSpec = {
        ...healthySpec,
        entities: [
          healthySpec.entities[0], // ParkingLot
          {
            name: 'Bay',
            responsibility: 'Allocates parking spots', // contains plural 'spots' -> matches 'Spot'
            attributes: ['id'],
            methods: ['allocate'],
          },
          {
            name: 'Pass',
            responsibility: 'Issues entry tickets', // contains plural 'tickets' -> matches 'Ticket'
            attributes: ['code'],
            methods: ['validate'],
          },
        ],
        relationships: [
          { from: 'ParkingLot', to: 'Bay', type: 'has-a' },
          { from: 'ParkingLot', to: 'Pass', type: 'uses' },
        ],
      };

      const results = await evaluator.evaluate({
        attemptId: 'plural-attempt',
        spec: pluralSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const reqUnder = results.find((r) => r.criterion === 'requirementUnderstanding')!;
      expect(reqUnder.score).toBe(5);
      expect(reqUnder.findings).toHaveLength(0);
    });
  });
});
