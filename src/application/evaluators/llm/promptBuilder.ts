import type { EvaluationContext } from '../../../domain/interfaces/Evaluator.js';

export const LLM_SYSTEM_PROMPT = `You are a Senior Staff Software Architect evaluating a Low-Level Design (LLD) submission.
Your job is to provide rigorous, explainable, evidence-grounded feedback across standard rubric dimensions.

CRITICAL RULES:
1. NEVER output a single arbitrary overall score or ask "is this a good design?".
2. You must evaluate against the exact rubric dimensions provided.
3. For EVERY finding, you MUST quote or cite the learner's actual submission and specify the exact JSON sourcePath (e.g. "entities[0].responsibility", "tradeoffs[1].why").
4. Output strict JSON matching the requested schema and nothing else.`;

export function buildLlmEvaluationPrompt(ctx: EvaluationContext): string {
  const { spec, problem, rubric } = ctx;

  return `Please evaluate the following Low-Level Design submission against the problem rubric.

### PRACTICE PROBLEM
Title: ${problem.title}
Description: ${problem.description}
Requirements:
${problem.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Expected Concepts: ${rubric.expectedConcepts.join(', ')}
Declared Extension Axes: ${rubric.extensionAxes.join(', ')}

### CANONICAL DESIGN SPECIFICATION SUBMITTED BY LEARNER
${JSON.stringify(spec, null, 2)}

### EVALUATION INSTRUCTIONS
Evaluate the design across these dimensions:
- requirementUnderstanding: Are problem requirements and core concepts addressed?
- classResponsibilities: Cohesion and Single Responsibility Principle.
- couplingCohesion: Coupling between entities and appropriate relationship types.
- encapsulationInterfaces: Data encapsulation and behavioral completeness.
- abstractionPatterns: Use of interfaces/patterns for declared extension axes.
- extensibility: How readily the design absorbs future changes.
- edgeCasesTestability: Handling of boundaries, state transitions, and testability.
- explanationQuality: Soundness of tradeoff reasoning (decision, alternative, why).

Output MUST be a JSON object with this exact shape:
{
  "dimensions": [
    {
      "criterion": "classResponsibilities",
      "score": 4.0,
      "confidence": 0.85,
      "findings": [
        {
          "quote": "...",
          "sourcePath": "entities[0].responsibility",
          "concern": "...",
          "suggestion": "..."
        }
      ]
    }
  ],
  "overallSummary": "High level evaluation summary..."
}`;
}
