import type { Evaluator, EvaluationContext } from '../../domain/interfaces/Evaluator.js';
import type { DimensionResult } from '../../domain/models/DimensionResult.js';
import { Evidence } from '../../domain/models/Evidence.js';
import type { DesignSpec, EntityDefinition } from '../../domain/models/DesignSpec.js';
import type { Rubric, RubricDimension } from '../../domain/models/Rubric.js';

/**
 * Deterministic rule-based evaluation engine.
 * Inspects the canonical DesignSpec without external calls or LLMs.
 * Every produced DimensionResult grounds its feedback with a validated Evidence sourcePath.
 */
export class DeterministicEvaluator implements Evaluator {
  readonly id = 'deterministic';

  supports(_ctx: EvaluationContext): boolean {
    return true;
  }

  async evaluate(ctx: EvaluationContext): Promise<readonly DimensionResult[]> {
    const { spec, rubric } = ctx;
    const results: DimensionResult[] = [];

    // 1. Requirement Understanding: Concept Coverage & Minimum counts
    results.push(this.evaluateRequirementUnderstanding(spec, rubric));

    // 2. Class Responsibilities: God-Class Heuristic & Duty Cohesion
    results.push(this.evaluateClassResponsibilities(spec));

    // 3. Coupling & Cohesion: Orphan Entity Heuristic
    results.push(this.evaluateCouplingCohesion(spec));

    // 4. Encapsulation & Interfaces: Anemic Domain Model Heuristic
    results.push(this.evaluateEncapsulationInterfaces(spec));

    // 5. Abstraction Patterns: Missing Abstraction for Extension Axes
    results.push(this.evaluateAbstractionPatterns(spec, rubric));

    // 6. Extensibility: Design flexibility for future changes
    results.push(this.evaluateExtensibility(spec, rubric));

    // 7. Edge Cases & Testability: Assumptions and isolation
    results.push(this.evaluateEdgeCasesTestability(spec));

    // 8. Explanation Quality: Depth of tradeoffs and reasoning
    results.push(this.evaluateExplanationQuality(spec, rubric));

    return results;
  }

  /**
   * Evaluates Requirement Understanding via expected concept coverage and rubric minimums.
   */
  private evaluateRequirementUnderstanding(spec: DesignSpec, rubric: Rubric): DimensionResult {
    const allText = [
      ...spec.assumptions,
      ...spec.entities.flatMap((e) => [e.name, e.responsibility, ...e.methods, ...e.attributes]),
      ...spec.interfaces.flatMap((i) => [i.name, i.purpose, ...i.methods]),
    ].join(' ').toLowerCase();

    const missingConcepts: string[] = [];
    const coveredConcepts: string[] = [];

    for (const concept of rubric.expectedConcepts) {
      if (allText.includes(concept.toLowerCase())) {
        coveredConcepts.push(concept);
      } else {
        missingConcepts.push(concept);
      }
    }

    const belowMinEntities = spec.entities.length < rubric.minEntities;
    const belowMinTradeoffs = spec.tradeoffs.length < rubric.minTradeoffs;

    if (belowMinEntities) {
      const quote = spec.entities.length > 0 ? spec.entities[0].name : 'entities: []';
      const sourcePath = spec.entities.length > 0 ? 'entities[0].name' : 'entities';
      return {
        criterion: 'requirementUnderstanding',
        score: 1,
        evidence: Evidence.create(quote, sourcePath),
        concern: `Submission defines ${spec.entities.length} entities, but problem requires at least ${rubric.minEntities}.`,
        suggestion: `Expand the domain model to include key entities required by the problem rubric.`,
        confidence: 1.0,
        evaluatorId: this.id,
      };
    }

    if (missingConcepts.length > 0) {
      const firstEntity = spec.entities[0];
      return {
        criterion: 'requirementUnderstanding',
        score: Math.max(1, 4 - missingConcepts.length),
        evidence: Evidence.create(firstEntity.name, 'entities[0].name'),
        concern: `Missing core domain concepts expected by the problem: ${missingConcepts.join(', ')}.`,
        suggestion: `Integrate representations or responsibilities for ${missingConcepts.join(', ')} into your design.`,
        confidence: 0.95,
        evaluatorId: this.id,
      };
    }

    const evidenceQuote = coveredConcepts.length > 0 ? coveredConcepts.join(', ') : spec.entities[0].name;
    return {
      criterion: 'requirementUnderstanding',
      score: belowMinTradeoffs ? 3 : 5,
      evidence: Evidence.create(spec.entities[0].name, 'entities[0].name'),
      concern: belowMinTradeoffs
        ? `Found ${spec.tradeoffs.length} tradeoffs, but minimum required is ${rubric.minTradeoffs}.`
        : undefined,
      suggestion: 'All expected core concepts covered in the design model.',
      confidence: 0.95,
      evaluatorId: this.id,
    };
  }

  /**
   * Evaluates Class Responsibilities with God-Class heuristics:
   * 1. Method count threshold (> 5 methods).
   * 2. Responsibility string with multiple unrelated duties / coordinating "and" / "as well as".
   */
  private evaluateClassResponsibilities(spec: DesignSpec): DimensionResult {
    if (spec.entities.length === 0) {
      return {
        criterion: 'classResponsibilities',
        score: 0,
        evidence: Evidence.create('entities: []', 'entities'),
        concern: 'No entities provided to evaluate responsibilities.',
        suggestion: 'Define domain entities with distinct single responsibilities.',
        confidence: 1.0,
        evaluatorId: this.id,
      };
    }

    // Check for God Class heuristic
    for (let i = 0; i < spec.entities.length; i++) {
      const entity = spec.entities[i];

      // Heuristic A: Excessive methods on a single class
      if (entity.methods.length > 5) {
        return {
          criterion: 'classResponsibilities',
          score: 2,
          evidence: Evidence.create(entity.methods.slice(0, 4).join(', ') + '...', `entities[${i}].methods`),
          concern: `God-class detected: '${entity.name}' declares ${entity.methods.length} methods, violating Single Responsibility Principle.`,
          suggestion: `Decompose '${entity.name}' into cohesive collaborators focused on single tasks.`,
          confidence: 0.95,
          evaluatorId: this.id,
        };
      }

      // Heuristic B: Responsibility string joining distinct duties with 'and' / 'as well as'
      const resp = entity.responsibility.toLowerCase();
      const hasConjunction = /\b(and|as well as|along with)\b/.test(resp);
      const actionWordsCount = (resp.match(/\b(manages|processes|handles|coordinates|calculates|stores|validates|generates|prints)\b/g) || []).length;

      if (hasConjunction && actionWordsCount >= 2) {
        return {
          criterion: 'classResponsibilities',
          score: 2,
          evidence: Evidence.create(entity.responsibility, `entities[${i}].responsibility`),
          concern: `Multiple responsibilities conflated in '${entity.name}': "${entity.responsibility}".`,
          suggestion: `Split '${entity.name}' so each class has exactly one reason to change.`,
          confidence: 0.9,
          evaluatorId: this.id,
        };
      }
    }

    // Clean responsibilities
    const cleanEntity = spec.entities[0];
    return {
      criterion: 'classResponsibilities',
      score: 5,
      evidence: Evidence.create(cleanEntity.responsibility, 'entities[0].responsibility'),
      suggestion: 'Responsibilities are well-scoped and adhere to Single Responsibility Principle.',
      confidence: 0.9,
      evaluatorId: this.id,
    };
  }

  /**
   * Evaluates Coupling & Cohesion via Orphan Entity Heuristic:
   * Flags any entity that participates in neither 'from' nor 'to' relationships.
   */
  private evaluateCouplingCohesion(spec: DesignSpec): DimensionResult {
    if (spec.entities.length === 0) {
      return {
        criterion: 'couplingCohesion',
        score: 0,
        evidence: Evidence.create('relationships: []', 'relationships'),
        concern: 'No entities or relationships specified.',
        suggestion: 'Specify relationships between entities.',
        confidence: 1.0,
        evaluatorId: this.id,
      };
    }

    if (spec.entities.length > 1 && spec.relationships.length === 0) {
      return {
        criterion: 'couplingCohesion',
        score: 1,
        evidence: Evidence.create(spec.entities[0].name, 'entities[0].name'),
        concern: 'No relationships defined between domain entities.',
        suggestion: 'Model has-a, is-a, or uses relationships between your entities.',
        confidence: 1.0,
        evaluatorId: this.id,
      };
    }

    // Collect related entity names
    const connectedEntities = new Set<string>();
    for (const rel of spec.relationships) {
      connectedEntities.add(rel.from.toLowerCase());
      connectedEntities.add(rel.to.toLowerCase());
    }

    // Find first orphan entity
    for (let i = 0; i < spec.entities.length; i++) {
      const entity = spec.entities[i];
      if (spec.entities.length > 1 && !connectedEntities.has(entity.name.toLowerCase())) {
        return {
          criterion: 'couplingCohesion',
          score: 2,
          evidence: Evidence.create(entity.name, `entities[${i}].name`),
          concern: `Orphan entity detected: '${entity.name}' is isolated and has no relationships to other entities.`,
          suggestion: `Connect '${entity.name}' to the domain model via composition (has-a) or dependency (uses).`,
          confidence: 0.95,
          evaluatorId: this.id,
        };
      }
    }

    const firstRel = spec.relationships[0];
    const relQuote = firstRel ? `${firstRel.from} ${firstRel.type} ${firstRel.to}` : spec.entities[0].name;
    const sourcePath = firstRel ? 'relationships[0]' : 'entities[0].name';

    return {
      criterion: 'couplingCohesion',
      score: 5,
      evidence: Evidence.create(relQuote, sourcePath),
      suggestion: 'Entities are appropriately connected without isolated orphans.',
      confidence: 0.9,
      evaluatorId: this.id,
    };
  }

  /**
   * Evaluates Encapsulation & Interfaces via Anemic Domain Model Heuristic:
   * Flags entities with attributes but 0 methods.
   */
  private evaluateEncapsulationInterfaces(spec: DesignSpec): DimensionResult {
    for (let i = 0; i < spec.entities.length; i++) {
      const entity = spec.entities[i];
      if (entity.attributes.length > 0 && entity.methods.length === 0) {
        return {
          criterion: 'encapsulationInterfaces',
          score: 2,
          evidence: Evidence.create(
            `${entity.name}: [${entity.attributes.join(', ')}]`,
            `entities[${i}].attributes`
          ),
          concern: `Anemic entity detected: '${entity.name}' holds state attributes but has no business methods.`,
          suggestion: `Push business operations that mutate or calculate over '${entity.name}' state into the entity itself.`,
          confidence: 0.95,
          evaluatorId: this.id,
        };
      }
    }

    const firstEntity = spec.entities[0];
    if (firstEntity && firstEntity.methods.length > 0) {
      return {
        criterion: 'encapsulationInterfaces',
        score: 5,
        evidence: Evidence.create(firstEntity.methods[0], 'entities[0].methods[0]'),
        suggestion: 'Entities encapsulate behavior with state.',
        confidence: 0.9,
        evaluatorId: this.id,
      };
    }

    return {
      criterion: 'encapsulationInterfaces',
      score: 3,
      evidence: Evidence.create('spec.entities', 'entities'),
      suggestion: 'Provide explicit methods to demonstrate behavioral encapsulation.',
      confidence: 0.8,
      evaluatorId: this.id,
    };
  }

  /**
   * Evaluates Abstraction Patterns via Missing Abstraction Heuristic:
   * For declared extensionAxes, checks if any interface or polymorphism is declared.
   */
  private evaluateAbstractionPatterns(spec: DesignSpec, rubric: Rubric): DimensionResult {
    const interfaceNames = spec.interfaces.map((i) => i.name.toLowerCase());
    const isARelationships = spec.relationships.filter((r) => r.type === 'is-a');

    for (const axis of rubric.extensionAxes) {
      const axisWords = axis.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      
      const hasMatchingInterface = interfaceNames.some((iname) =>
        axisWords.some((word) => iname.includes(word))
      );

      const hasInheritanceHierarchy = isARelationships.some((rel) =>
        axisWords.some((word) => rel.to.toLowerCase().includes(word) || rel.from.toLowerCase().includes(word))
      );

      if (!hasMatchingInterface && !hasInheritanceHierarchy) {
        return {
          criterion: 'abstractionPatterns',
          score: 2,
          evidence: Evidence.create(spec.extensibility || 'No extensibility details', 'extensibility'),
          concern: `Missing abstraction for declared extension axis: '${axis}'. No interface or abstract hierarchy covers this variation point.`,
          suggestion: `Introduce a Strategy or Factory interface representing the '${axis}' abstraction.`,
          confidence: 0.95,
          evaluatorId: this.id,
        };
      }
    }

    const firstInterface = spec.interfaces[0];
    if (firstInterface) {
      return {
        criterion: 'abstractionPatterns',
        score: 5,
        evidence: Evidence.create(firstInterface.name, 'interfaces[0].name'),
        suggestion: 'Declared interfaces appropriately isolate extension axes.',
        confidence: 0.9,
        evaluatorId: this.id,
      };
    }

    return {
      criterion: 'abstractionPatterns',
      score: 4,
      evidence: Evidence.create(spec.extensibility, 'extensibility'),
      suggestion: 'Polymorphic hierarchy matches declared extension axes.',
      confidence: 0.85,
      evaluatorId: this.id,
    };
  }

  /**
   * Evaluates Extensibility section.
   */
  private evaluateExtensibility(spec: DesignSpec, rubric: Rubric): DimensionResult {
    if (!spec.extensibility || spec.extensibility.trim().length < 20) {
      return {
        criterion: 'extensibility',
        score: 1,
        evidence: Evidence.create(spec.extensibility || 'empty', 'extensibility'),
        concern: 'Extensibility explanation is brief or absent.',
        suggestion: 'Detail how the architecture absorbs future extension requirements without modifying existing classes (OCP).',
        confidence: 0.95,
        evaluatorId: this.id,
      };
    }

    return {
      criterion: 'extensibility',
      score: 4,
      evidence: Evidence.create(spec.extensibility.slice(0, 50) + '...', 'extensibility'),
      suggestion: 'Clear description of how new requirements are accommodated.',
      confidence: 0.85,
      evaluatorId: this.id,
    };
  }

  /**
   * Evaluates Edge Cases & Testability.
   */
  private evaluateEdgeCasesTestability(spec: DesignSpec): DimensionResult {
    if (spec.assumptions.length === 0) {
      return {
        criterion: 'edgeCasesTestability',
        score: 2,
        evidence: Evidence.create('assumptions: []', 'assumptions'),
        concern: 'No assumptions or boundary conditions specified.',
        suggestion: 'State key assumptions (e.g. concurrency, capacity limits, fault tolerance).',
        confidence: 0.9,
        evaluatorId: this.id,
      };
    }

    return {
      criterion: 'edgeCasesTestability',
      score: 4,
      evidence: Evidence.create(spec.assumptions[0], 'assumptions[0]'),
      suggestion: 'Assumptions provide clarity on system boundaries and testability.',
      confidence: 0.85,
      evaluatorId: this.id,
    };
  }

  /**
   * Evaluates Explanation Quality & Tradeoffs.
   */
  private evaluateExplanationQuality(spec: DesignSpec, rubric: Rubric): DimensionResult {
    if (spec.tradeoffs.length < rubric.minTradeoffs) {
      const quote = spec.tradeoffs.length > 0 ? spec.tradeoffs[0].decision : 'tradeoffs: []';
      const sourcePath = spec.tradeoffs.length > 0 ? 'tradeoffs[0].decision' : 'tradeoffs';
      return {
        criterion: 'explanationQuality',
        score: 2,
        evidence: Evidence.create(quote, sourcePath),
        concern: `Problem requires at least ${rubric.minTradeoffs} tradeoffs, but found ${spec.tradeoffs.length}.`,
        suggestion: `Document architectural tradeoffs: decision, alternative considered, and why you chose it.`,
        confidence: 1.0,
        evaluatorId: this.id,
      };
    }

    // Check for shallow tradeoff reasoning
    for (let i = 0; i < spec.tradeoffs.length; i++) {
      const t = spec.tradeoffs[i];
      if (t.why.trim().length < 15) {
        return {
          criterion: 'explanationQuality',
          score: 3,
          evidence: Evidence.create(t.why, `tradeoffs[${i}].why`),
          concern: `Tradeoff rationale for '${t.decision}' is shallow.`,
          suggestion: `Articulate the exact engineering costs and benefits that guided your decision.`,
          confidence: 0.9,
          evaluatorId: this.id,
        };
      }
    }

    return {
      criterion: 'explanationQuality',
      score: 5,
      evidence: Evidence.create(spec.tradeoffs[0].why, 'tradeoffs[0].why'),
      suggestion: 'Tradeoff decisions are supported by sound technical rationale.',
      confidence: 0.9,
      evaluatorId: this.id,
    };
  }
}
