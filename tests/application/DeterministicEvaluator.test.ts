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

describe('DeterministicEvaluator Heuristics', () => {
  let evaluator: DeterministicEvaluator;

  beforeEach(() => {
    evaluator = new DeterministicEvaluator();
  });

  it('evaluates healthy submission with high scores and valid evidence on all dimensions', async () => {
    const ctx: EvaluationContext = {
      attemptId: 'healthy-attempt',
      spec: healthySpec,
      problem: baseProblem,
      rubric: baseRubric,
    };

    const results = await evaluator.evaluate(ctx);
    expect(results).toHaveLength(8);

    for (const res of results) {
      expect(res.score).toBeGreaterThanOrEqual(4);
      expect(res.evidence.quote.trim().length).toBeGreaterThan(0);
      expect(res.evidence.sourcePath.trim().length).toBeGreaterThan(0);
      expect(res.evaluatorId).toBe('deterministic');
    }
  });

  describe('God-Class Heuristic', () => {
    it('triggers god-class when entity has excessive methods (> 5)', async () => {
      const godClassSpec: DesignSpec = {
        ...healthySpec,
        entities: [
          {
            name: 'SuperParkingManager',
            responsibility: 'Manages entire parking domain',
            attributes: ['spots', 'tickets', 'payments', 'gates'],
            methods: [
              'parkVehicle',
              'vacateSpot',
              'calculateFee',
              'processCreditCard',
              'printTicket',
              'openGate',
              'triggerAlarm',
            ],
          },
          ...healthySpec.entities.slice(1),
        ],
      };

      const results = await evaluator.evaluate({
        attemptId: 'god-class-attempt',
        spec: godClassSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const classResp = results.find((r) => r.criterion === 'classResponsibilities')!;
      expect(classResp.score).toBe(2);
      expect(classResp.concern).toMatch(/God-class detected/);
      expect(classResp.evidence.sourcePath).toBe('entities[0].methods');
    });

    it('triggers god-class when responsibility string conflates multiple distinct duties with "and"', async () => {
      const multiDutySpec: DesignSpec = {
        ...healthySpec,
        entities: [
          {
            name: 'ParkingLot',
            responsibility: 'Manages spot allocation and processes customer payments and prints receipts',
            attributes: ['spots'],
            methods: ['parkVehicle', 'vacateSpot'],
          },
          ...healthySpec.entities.slice(1),
        ],
      };

      const results = await evaluator.evaluate({
        attemptId: 'multi-duty-attempt',
        spec: multiDutySpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const classResp = results.find((r) => r.criterion === 'classResponsibilities')!;
      expect(classResp.score).toBe(2);
      expect(classResp.concern).toMatch(/Multiple responsibilities conflated/);
      expect(classResp.evidence.sourcePath).toBe('entities[0].responsibility');
    });

    it('does not trigger god-class when classes have focused single responsibilities', async () => {
      const results = await evaluator.evaluate({
        attemptId: 'clean-resp-attempt',
        spec: healthySpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const classResp = results.find((r) => r.criterion === 'classResponsibilities')!;
      expect(classResp.score).toBe(5);
      expect(classResp.concern).toBeUndefined();
    });
  });

  describe('Missing Abstraction Heuristic', () => {
    it('triggers missing abstraction when declared extension axis has no interface/hierarchy', async () => {
      const missingAbsSpec: DesignSpec = {
        ...healthySpec,
        interfaces: [], // Removed PricingStrategy interface
      };

      const results = await evaluator.evaluate({
        attemptId: 'missing-abs-attempt',
        spec: missingAbsSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const absResult = results.find((r) => r.criterion === 'abstractionPatterns')!;
      expect(absResult.score).toBe(2);
      expect(absResult.concern).toMatch(/Missing abstraction for declared extension axis: 'PricingStrategy'/);
      expect(absResult.evidence.sourcePath).toBe('extensibility');
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
      expect(absResult.evidence.sourcePath).toBe('interfaces[0].name');
    });
  });

  describe('Orphan Entity Heuristic', () => {
    it('triggers orphan entity when an entity participates in zero relationships', async () => {
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
        // AuditLogger is not in relationships
      };

      const results = await evaluator.evaluate({
        attemptId: 'orphan-attempt',
        spec: orphanSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const couplingResult = results.find((r) => r.criterion === 'couplingCohesion')!;
      expect(couplingResult.score).toBe(2);
      expect(couplingResult.concern).toMatch(/Orphan entity detected: 'AuditLogger'/);
      expect(couplingResult.evidence.sourcePath).toBe('entities[3].name');
      expect(couplingResult.evidence.quote).toBe('AuditLogger');
    });

    it('does not trigger orphan entity when all entities are connected via relationships', async () => {
      const results = await evaluator.evaluate({
        attemptId: 'connected-attempt',
        spec: healthySpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const couplingResult = results.find((r) => r.criterion === 'couplingCohesion')!;
      expect(couplingResult.score).toBe(5);
      expect(couplingResult.concern).toBeUndefined();
    });
  });

  describe('Anemic Model Heuristic', () => {
    it('triggers anemic entity when entity has state attributes but 0 methods', async () => {
      const anemicSpec: DesignSpec = {
        ...healthySpec,
        entities: [
          healthySpec.entities[0],
          {
            name: 'Spot',
            responsibility: 'Holds spot data',
            attributes: ['isOccupied', 'spotType'],
            methods: [], // 0 methods!
          },
          healthySpec.entities[2],
        ],
      };

      const results = await evaluator.evaluate({
        attemptId: 'anemic-attempt',
        spec: anemicSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const encapResult = results.find((r) => r.criterion === 'encapsulationInterfaces')!;
      expect(encapResult.score).toBe(2);
      expect(encapResult.concern).toMatch(/Anemic entity detected: 'Spot'/);
      expect(encapResult.evidence.sourcePath).toBe('entities[1].attributes');
    });

    it('does not trigger anemic entity when entities encapsulate business methods', async () => {
      const results = await evaluator.evaluate({
        attemptId: 'encapsulated-attempt',
        spec: healthySpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const encapResult = results.find((r) => r.criterion === 'encapsulationInterfaces')!;
      expect(encapResult.score).toBe(5);
      expect(encapResult.concern).toBeUndefined();
    });
  });

  describe('Minimum Entity and Tradeoff Counts', () => {
    it('triggers requirement understanding penalty when below minEntities', async () => {
      const fewEntitiesSpec: DesignSpec = {
        ...healthySpec,
        entities: [healthySpec.entities[0]], // Only 1 entity when min is 3
        relationships: [],
      };

      const results = await evaluator.evaluate({
        attemptId: 'few-entities-attempt',
        spec: fewEntitiesSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const reqResult = results.find((r) => r.criterion === 'requirementUnderstanding')!;
      expect(reqResult.score).toBe(1);
      expect(reqResult.concern).toMatch(/defines 1 entities, but problem requires at least 3/);
    });

    it('triggers explanation quality penalty when below minTradeoffs', async () => {
      const fewTradeoffsSpec: DesignSpec = {
        ...healthySpec,
        tradeoffs: [healthySpec.tradeoffs[0]], // Only 1 tradeoff when min is 2
      };

      const results = await evaluator.evaluate({
        attemptId: 'few-tradeoffs-attempt',
        spec: fewTradeoffsSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const expResult = results.find((r) => r.criterion === 'explanationQuality')!;
      expect(expResult.score).toBe(2);
      expect(expResult.concern).toMatch(/requires at least 2 tradeoffs, but found 1/);
    });
  });

  describe('Concept Coverage Heuristic', () => {
    it('triggers requirement understanding penalty when core concept is omitted', async () => {
      const missingConceptSpec: DesignSpec = {
        ...healthySpec,
        entities: [
          healthySpec.entities[0],
          healthySpec.entities[1],
          {
            name: 'Receipt',
            responsibility: 'Receipt info',
            attributes: ['id'],
            methods: ['print'],
          },
        ],
        relationships: [
          { from: 'ParkingLot', to: 'Spot', type: 'has-a', note: 'Lot contains spots' },
        ],
        interfaces: [
          {
            name: 'PricingStrategy',
            purpose: 'Enables flexible hourly or flat pricing schemes',
            methods: ['calculateFee(hours: number): number'],
          },
        ],
      };

      const results = await evaluator.evaluate({
        attemptId: 'missing-concept-attempt',
        spec: missingConceptSpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const reqResult = results.find((r) => r.criterion === 'requirementUnderstanding')!;
      expect(reqResult.concern).toMatch(/Missing core domain concepts expected by the problem: Ticket/);
    });

    it('does not trigger concept coverage penalty when all expected concepts are covered', async () => {
      const results = await evaluator.evaluate({
        attemptId: 'all-concepts-attempt',
        spec: healthySpec,
        problem: baseProblem,
        rubric: baseRubric,
      });

      const reqResult = results.find((r) => r.criterion === 'requirementUnderstanding')!;
      expect(reqResult.score).toBe(5);
      expect(reqResult.concern).toBeUndefined();
    });
  });
});
