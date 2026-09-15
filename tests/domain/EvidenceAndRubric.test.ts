import { describe, it, expect } from 'vitest';
import { Evidence } from '../../src/domain/models/Evidence.js';
import { Rubric, type RubricDimension } from '../../src/domain/models/Rubric.js';

describe('Evidence Value Object', () => {
  it('constructs successfully with non-blank quote and sourcePath', () => {
    const ev = Evidence.create('class ParkingLot', 'entities[0].name');
    expect(ev.quote).toBe('class ParkingLot');
    expect(ev.sourcePath).toBe('entities[0].name');
  });

  it('rejects empty or whitespace-only quote', () => {
    expect(() => Evidence.create('', 'entities[0].name')).toThrow(/Evidence quote cannot be empty/);
    expect(() => Evidence.create('   ', 'entities[0].name')).toThrow(/Evidence quote cannot be empty/);
  });

  it('rejects empty or whitespace-only sourcePath', () => {
    expect(() => Evidence.create('class ParkingLot', '')).toThrow(/Evidence sourcePath cannot be empty/);
    expect(() => Evidence.create('class ParkingLot', '   \t')).toThrow(/Evidence sourcePath cannot be empty/);
  });
});

describe('Rubric Domain Entity & Weights Invariants', () => {
  const validWeights: Record<RubricDimension, number> = {
    requirementUnderstanding: 0.15,
    classResponsibilities: 0.20,
    couplingCohesion: 0.15,
    encapsulationInterfaces: 0.10,
    abstractionPatterns: 0.10,
    extensibility: 0.10,
    edgeCasesTestability: 0.10,
    explanationQuality: 0.10,
  }; // Sum = 1.00

  it('creates Rubric successfully when weights sum to 1.0', () => {
    const rubric = Rubric.create({
      rubricVersion: '1.0.0',
      expectedConcepts: ['Spot', 'Vehicle', 'Ticket'],
      extensionAxes: ['Multiple vehicle types', 'Pricing strategies'],
      minEntities: 3,
      minTradeoffs: 2,
      dimensionWeights: validWeights,
    });

    expect(rubric.rubricVersion).toBe('1.0.0');
    expect(rubric.minEntities).toBe(3);
    expect(rubric.dimensionWeights.requirementUnderstanding).toBe(0.15);
  });

  it('rejects rubric when weights do not sum to 1.0', () => {
    const invalidWeights = {
      ...validWeights,
      classResponsibilities: 0.50, // Now sum is 1.30
    };

    expect(() =>
      Rubric.create({
        rubricVersion: '1.0.0',
        expectedConcepts: ['Spot'],
        extensionAxes: ['Pricing'],
        minEntities: 2,
        minTradeoffs: 2,
        dimensionWeights: invalidWeights,
      })
    ).toThrow(/weights must sum to 1\.0/);
  });

  it('rejects empty rubric version', () => {
    expect(() =>
      Rubric.create({
        rubricVersion: '',
        expectedConcepts: ['Spot'],
        extensionAxes: ['Pricing'],
        minEntities: 2,
        minTradeoffs: 2,
        dimensionWeights: validWeights,
      })
    ).toThrow(/Rubric version cannot be empty/);
  });
});
