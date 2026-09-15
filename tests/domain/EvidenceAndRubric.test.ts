import { describe, it, expect } from 'vitest';
import { Evidence, quoteRef, absenceRef } from '../../src/domain/models/Evidence.js';
import { Rubric, type RubricDimension } from '../../src/domain/models/Rubric.js';
import { deriveScoreFromFindings } from '../../src/domain/models/DimensionResult.js';

describe('Evidence & EvidenceRef', () => {
  it('constructs Evidence successfully with non-blank quote and sourcePath', () => {
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

  it('creates quoteRef and absenceRef correctly', () => {
    const q = quoteRef('Spot', 'entities[1].name');
    expect(q.kind).toBe('quote');
    if (q.kind === 'quote') {
      expect(q.evidence.quote).toBe('Spot');
    }

    const a = absenceRef('interfaces', 'Missing interface');
    expect(a.kind).toBe('absence');
    if (a.kind === 'absence') {
      expect(a.expectedPath).toBe('interfaces');
    }
  });

  it('derives scores from findings correctly', () => {
    expect(deriveScoreFromFindings([])).toBe(5.0);
    const mockFinding = {
      evidenceRef: absenceRef('entities', 'Missing'),
      concern: 'C',
      suggestion: 'S',
    };
    expect(deriveScoreFromFindings([mockFinding])).toBe(3.5);
    expect(deriveScoreFromFindings([mockFinding, mockFinding])).toBe(2.0);
    expect(deriveScoreFromFindings([mockFinding, mockFinding, mockFinding, mockFinding])).toBe(0.0);
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
  };

  it('creates Rubric with default configurable thresholds when omitted', () => {
    const rubric = Rubric.create({
      rubricVersion: '1.0.0',
      expectedConcepts: ['Spot', 'Vehicle', 'Ticket'],
      extensionAxes: ['Multiple vehicle types', 'Pricing strategies'],
      minEntities: 3,
      minTradeoffs: 2,
      dimensionWeights: validWeights,
    });

    expect(rubric.rubricVersion).toBe('1.0.0');
    expect(rubric.godClassMethodThreshold).toBe(7);
    expect(rubric.minRationaleLength).toBe(15);
    expect(rubric.minExtensibilityLength).toBe(20);
  });

  it('creates Rubric with custom thresholds when provided', () => {
    const rubric = Rubric.create({
      rubricVersion: '1.1.0',
      expectedConcepts: ['Spot'],
      extensionAxes: [],
      minEntities: 2,
      minTradeoffs: 1,
      dimensionWeights: validWeights,
      godClassMethodThreshold: 10,
      minRationaleLength: 30,
      minExtensibilityLength: 50,
    });

    expect(rubric.godClassMethodThreshold).toBe(10);
    expect(rubric.minRationaleLength).toBe(30);
    expect(rubric.minExtensibilityLength).toBe(50);
  });

  it('rejects rubric when weights do not sum to 1.0', () => {
    const invalidWeights = {
      ...validWeights,
      classResponsibilities: 0.50,
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
});
