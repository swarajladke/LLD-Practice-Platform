import type { Evaluator, EvaluationContext } from '../../domain/interfaces/Evaluator.js';
import {
  type DimensionResult,
  type Finding,
  deriveScoreFromFindings,
} from '../../domain/models/DimensionResult.js';
import { quoteRef, absenceRef } from '../../domain/models/Evidence.js';
import type { DesignSpec } from '../../domain/models/DesignSpec.js';
import type { Rubric } from '../../domain/models/Rubric.js';

/**
 * Normalizes text tokens by lowercasing and stripping common plural suffixes ('s', 'es').
 */
function tokenizeAndNormalize(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  const normalized = new Set<string>();
  for (const word of words) {
    if (word.length === 0) continue;
    normalized.add(word);
    if (word.endsWith('es') && word.length > 3) {
      normalized.add(word.slice(0, -2));
    } else if (word.endsWith('s') && word.length > 2) {
      normalized.add(word.slice(0, -1));
    }
  }
  return normalized;
}

/**
 * Deterministic rule-based evaluation engine.
 * Inspects canonical DesignSpec, collecting ALL findings per dimension.
 * Every finding is honestly grounded by a quote or documented absence and stamped with evaluatorId.
 */
export class DeterministicEvaluator implements Evaluator {
  readonly id = 'deterministic';

  supports(_ctx: EvaluationContext): boolean {
    return true;
  }

  async evaluate(ctx: EvaluationContext): Promise<readonly DimensionResult[]> {
    const { spec, rubric } = ctx;

    return [
      this.evaluateRequirementUnderstanding(spec, rubric),
      this.evaluateClassResponsibilities(spec, rubric),
      this.evaluateCouplingCohesion(spec),
      this.evaluateEncapsulationInterfaces(spec),
      this.evaluateAbstractionPatterns(spec, rubric),
      this.evaluateExtensibility(spec, rubric),
      this.evaluateEdgeCasesTestability(spec),
      this.evaluateExplanationQuality(spec, rubric),
    ];
  }

  /**
   * 1. Requirement Understanding: Concept coverage and minimum entity count.
   */
  private evaluateRequirementUnderstanding(spec: DesignSpec, rubric: Rubric): DimensionResult {
    const findings: Finding[] = [];

    if (spec.entities.length < rubric.minEntities) {
      findings.push({
        evidenceRef: absenceRef(
          'entities',
          `Declared ${spec.entities.length} entities; rubric requires at least ${rubric.minEntities}`
        ),
        concern: `Submission defines ${spec.entities.length} entities, but problem rubric requires at least ${rubric.minEntities}.`,
        suggestion: `Expand the domain model to model the core components of the problem.`,
        evaluatorId: this.id,
      });
    }

    const corpusParts = [
      ...spec.assumptions,
      ...spec.entities.flatMap((e) => [e.name, e.responsibility, ...e.methods, ...e.attributes]),
      ...spec.interfaces.flatMap((i) => [i.name, i.purpose, ...i.methods]),
      ...spec.tradeoffs.flatMap((t) => [t.decision, t.alternative, t.why]),
      spec.extensibility,
    ];
    const corpusTokens = tokenizeAndNormalize(corpusParts.join(' '));

    for (const concept of rubric.expectedConcepts) {
      const conceptTokens = tokenizeAndNormalize(concept);
      let matched = false;
      for (const token of conceptTokens) {
        if (corpusTokens.has(token)) {
          matched = true;
          break;
        }
      }

      if (!matched) {
        findings.push({
          evidenceRef: absenceRef('expectedConcepts', `Expected concept '${concept}' not found in submission`),
          concern: `Missing core domain concept expected by problem: '${concept}'.`,
          suggestion: `Incorporate '${concept}' into entity responsibilities, interfaces, or attributes.`,
          evaluatorId: this.id,
        });
      }
    }

    return {
      criterion: 'requirementUnderstanding',
      findings,
      score: deriveScoreFromFindings(findings, 1.5),
      confidence: 0.95,
      evaluatorIds: [this.id],
    };
  }

  /**
   * 2. Class Responsibilities: God-class method count and conflated responsibilities.
   */
  private evaluateClassResponsibilities(spec: DesignSpec, rubric: Rubric): DimensionResult {
    const findings: Finding[] = [];

    if (spec.entities.length === 0) {
      findings.push({
        evidenceRef: absenceRef('entities', 'No entities provided in design specification'),
        concern: 'No entities provided to evaluate responsibilities.',
        suggestion: 'Define domain entities with distinct single responsibilities.',
        evaluatorId: this.id,
      });
      return {
        criterion: 'classResponsibilities',
        findings,
        score: 0,
        confidence: 1.0,
        evaluatorIds: [this.id],
      };
    }

    for (let i = 0; i < spec.entities.length; i++) {
      const entity = spec.entities[i];

      if (entity.methods.length > rubric.godClassMethodThreshold) {
        findings.push({
          evidenceRef: quoteRef(
            entity.methods.slice(0, 4).join(', ') + '...',
            `entities[${i}].methods`
          ),
          concern: `God-class detected: '${entity.name}' declares ${entity.methods.length} methods (threshold: ${rubric.godClassMethodThreshold}).`,
          suggestion: `Decompose '${entity.name}' into smaller, cohesive classes following SRP.`,
          evaluatorId: this.id,
        });
      }

      const resp = entity.responsibility.toLowerCase();
      const hasConjunction = /\b(and|as well as|along with)\b/.test(resp);
      const actionWordsCount = (
        resp.match(/\b(manages|processes|handles|coordinates|calculates|stores|validates|generates|prints)\b/g) || []
      ).length;

      if (hasConjunction && actionWordsCount >= 2) {
        findings.push({
          evidenceRef: quoteRef(entity.responsibility, `entities[${i}].responsibility`),
          concern: `Multiple responsibilities conflated in '${entity.name}': "${entity.responsibility}".`,
          suggestion: `Split '${entity.name}' so each class has exactly one reason to change.`,
          evaluatorId: this.id,
        });
      }
    }

    return {
      criterion: 'classResponsibilities',
      findings,
      score: deriveScoreFromFindings(findings, 1.5),
      confidence: 0.9,
      evaluatorIds: [this.id],
    };
  }

  /**
   * 3. Coupling & Cohesion: Identifies ALL orphan entities.
   */
  private evaluateCouplingCohesion(spec: DesignSpec): DimensionResult {
    const findings: Finding[] = [];

    if (spec.entities.length === 0) {
      findings.push({
        evidenceRef: absenceRef('entities', 'No entities provided in submission'),
        concern: 'No entities or relationships specified.',
        suggestion: 'Specify entities and relationships.',
        evaluatorId: this.id,
      });
      return {
        criterion: 'couplingCohesion',
        findings,
        score: 0,
        confidence: 1.0,
        evaluatorIds: [this.id],
      };
    }

    if (spec.entities.length > 1 && spec.relationships.length === 0) {
      findings.push({
        evidenceRef: absenceRef('relationships', 'No relationships defined between entities'),
        concern: 'No relationships defined between domain entities.',
        suggestion: 'Model has-a, is-a, or uses relationships between your entities.',
        evaluatorId: this.id,
      });
    }

    const connectedEntities = new Set<string>();
    for (const rel of spec.relationships) {
      connectedEntities.add(rel.from.toLowerCase());
      connectedEntities.add(rel.to.toLowerCase());
    }

    for (let i = 0; i < spec.entities.length; i++) {
      const entity = spec.entities[i];
      if (spec.entities.length > 1 && !connectedEntities.has(entity.name.toLowerCase())) {
        findings.push({
          evidenceRef: quoteRef(entity.name, `entities[${i}].name`),
          concern: `Orphan entity detected: '${entity.name}' has no relationships to other entities.`,
          suggestion: `Connect '${entity.name}' to the domain model via composition (has-a) or dependency (uses).`,
          evaluatorId: this.id,
        });
      }
    }

    return {
      criterion: 'couplingCohesion',
      findings,
      score: deriveScoreFromFindings(findings, 1.5),
      confidence: 0.95,
      evaluatorIds: [this.id],
    };
  }

  /**
   * 4. Encapsulation & Interfaces: Identifies ALL anemic entities.
   */
  private evaluateEncapsulationInterfaces(spec: DesignSpec): DimensionResult {
    const findings: Finding[] = [];

    if (spec.entities.length === 0) {
      findings.push({
        evidenceRef: absenceRef('entities', 'No entities declared to evaluate encapsulation'),
        concern: 'No entities provided to evaluate encapsulation.',
        suggestion: 'Define domain entities with both state and behavior.',
        evaluatorId: this.id,
      });
      return {
        criterion: 'encapsulationInterfaces',
        findings,
        score: 0,
        confidence: 1.0,
        evaluatorIds: [this.id],
      };
    }

    for (let i = 0; i < spec.entities.length; i++) {
      const entity = spec.entities[i];
      if (entity.attributes.length > 0 && entity.methods.length === 0) {
        findings.push({
          evidenceRef: quoteRef(
            `${entity.name}: [${entity.attributes.join(', ')}]`,
            `entities[${i}].attributes`
          ),
          concern: `Anemic entity detected: '${entity.name}' holds state attributes but no methods.`,
          suggestion: `Encapsulate operations that mutate or calculate over '${entity.name}' state inside the entity.`,
          evaluatorId: this.id,
        });
      }
    }

    return {
      criterion: 'encapsulationInterfaces',
      findings,
      score: deriveScoreFromFindings(findings, 1.5),
      confidence: 0.95,
      evaluatorIds: [this.id],
    };
  }

  /**
   * 5. Abstraction Patterns: Identifies missing abstractions for declared extension axes.
   */
  private evaluateAbstractionPatterns(spec: DesignSpec, rubric: Rubric): DimensionResult {
    const findings: Finding[] = [];
    const interfaceNames = spec.interfaces.map((i) => i.name.toLowerCase());
    const isARelationships = spec.relationships.filter((r) => r.type === 'is-a');

    for (const axis of rubric.extensionAxes) {
      const axisWords = axis.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

      const hasMatchingInterface = interfaceNames.some((iname) =>
        axisWords.some((word) => iname.includes(word))
      );

      const hasInheritanceHierarchy = isARelationships.some((rel) =>
        axisWords.some(
          (word) => rel.to.toLowerCase().includes(word) || rel.from.toLowerCase().includes(word)
        )
      );

      if (!hasMatchingInterface && !hasInheritanceHierarchy) {
        findings.push({
          evidenceRef: absenceRef(
            'interfaces',
            `Missing interface or hierarchy for declared extension axis '${axis}'`
          ),
          concern: `Missing abstraction for declared extension axis: '${axis}'.`,
          suggestion: `Introduce a Strategy or Factory interface representing the '${axis}' abstraction.`,
          evaluatorId: this.id,
        });
      }
    }

    return {
      criterion: 'abstractionPatterns',
      findings,
      score: deriveScoreFromFindings(findings, 2.0),
      confidence: 0.95,
      evaluatorIds: [this.id],
    };
  }

  /**
   * 6. Extensibility: Evaluates depth of extensibility notes using rubric threshold.
   */
  private evaluateExtensibility(spec: DesignSpec, rubric: Rubric): DimensionResult {
    const findings: Finding[] = [];
    const trimmed = (spec.extensibility || '').trim();

    if (trimmed.length === 0) {
      findings.push({
        evidenceRef: absenceRef('extensibility', 'Extensibility explanation is missing'),
        concern: 'Extensibility explanation is missing.',
        suggestion: 'Describe how your design absorbs future requirements without modifying existing classes (OCP).',
        evaluatorId: this.id,
      });
    } else if (trimmed.length < rubric.minExtensibilityLength) {
      findings.push({
        evidenceRef: quoteRef(trimmed, 'extensibility'),
        concern: `Extensibility rationale is too brief (${trimmed.length} chars, threshold: ${rubric.minExtensibilityLength}).`,
        suggestion: 'Provide a detailed explanation of how extension axes are supported.',
        evaluatorId: this.id,
      });
    }

    return {
      criterion: 'extensibility',
      findings,
      score: deriveScoreFromFindings(findings, 2.0),
      confidence: 0.9,
      evaluatorIds: [this.id],
    };
  }

  /**
   * 7. Edge Cases & Testability: Evaluates presence and clarity of assumptions.
   */
  private evaluateEdgeCasesTestability(spec: DesignSpec): DimensionResult {
    const findings: Finding[] = [];

    if (spec.assumptions.length === 0) {
      findings.push({
        evidenceRef: absenceRef('assumptions', 'No assumptions or boundary constraints specified'),
        concern: 'No assumptions or boundary conditions specified.',
        suggestion: 'State key assumptions (e.g. concurrency limits, network failure, capacity constraints).',
        evaluatorId: this.id,
      });
    }

    return {
      criterion: 'edgeCasesTestability',
      findings,
      score: deriveScoreFromFindings(findings, 2.0),
      confidence: 0.85,
      evaluatorIds: [this.id],
    };
  }

  /**
   * 8. Explanation Quality: Evaluates tradeoff counts and rationale depth.
   */
  private evaluateExplanationQuality(spec: DesignSpec, rubric: Rubric): DimensionResult {
    const findings: Finding[] = [];

    if (spec.tradeoffs.length < rubric.minTradeoffs) {
      findings.push({
        evidenceRef: absenceRef(
          'tradeoffs',
          `Declared ${spec.tradeoffs.length} tradeoffs; rubric requires at least ${rubric.minTradeoffs}`
        ),
        concern: `Rubric requires at least ${rubric.minTradeoffs} tradeoffs, but found ${spec.tradeoffs.length}.`,
        suggestion: 'Document architectural tradeoffs: decision, alternative considered, and engineering rationale.',
        evaluatorId: this.id,
      });
    }

    for (let i = 0; i < spec.tradeoffs.length; i++) {
      const t = spec.tradeoffs[i];
      if (t.why.trim().length < rubric.minRationaleLength) {
        findings.push({
          evidenceRef: quoteRef(t.why, `tradeoffs[${i}].why`),
          concern: `Tradeoff rationale for '${t.decision}' is shallow (${t.why.trim().length} chars, threshold: ${rubric.minRationaleLength}).`,
          suggestion: 'Articulate the technical costs and benefits that guided your decision.',
          evaluatorId: this.id,
        });
      }
    }

    return {
      criterion: 'explanationQuality',
      findings,
      score: deriveScoreFromFindings(findings, 1.5),
      confidence: 0.95,
      evaluatorIds: [this.id],
    };
  }
}
