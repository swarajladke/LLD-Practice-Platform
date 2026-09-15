import type { Evaluator, EvaluationContext } from '../../domain/interfaces/Evaluator.js';
import type { LlmClient } from '../../domain/interfaces/LlmClient.js';
import type { DimensionResult, Finding } from '../../domain/models/DimensionResult.js';
import { quoteRef } from '../../domain/models/Evidence.js';
import {
  LLM_SYSTEM_PROMPT,
  buildLlmEvaluationPrompt,
} from './llm/promptBuilder.js';
import { LlmEvaluationResponseSchema } from './llm/LlmSchemas.js';

export class LlmEvaluator implements Evaluator {
  readonly id: string;
  private readonly llmClient: LlmClient;
  private readonly isSupportedFn?: (ctx: EvaluationContext) => boolean;

  constructor(
    llmClient: LlmClient,
    id: string = 'llm',
    isSupportedFn?: (ctx: EvaluationContext) => boolean
  ) {
    this.llmClient = llmClient;
    this.id = id;
    this.isSupportedFn = isSupportedFn;
  }

  supports(ctx: EvaluationContext): boolean {
    if (this.isSupportedFn) {
      return this.isSupportedFn(ctx);
    }
    return true;
  }

  async evaluate(ctx: EvaluationContext): Promise<readonly DimensionResult[]> {
    const prompt = buildLlmEvaluationPrompt(ctx);

    const rawResponse = await this.llmClient.generateText(prompt, {
      temperature: 0,
      systemPrompt: LLM_SYSTEM_PROMPT,
    });

    let jsonParsed: unknown;
    try {
      jsonParsed = JSON.parse(rawResponse);
    } catch (parseError) {
      throw new Error(
        `LLM returned invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    const validated = LlmEvaluationResponseSchema.parse(jsonParsed);

    return validated.dimensions.map((dim): DimensionResult => {
      const findings: Finding[] = dim.findings.map((f) => ({
        evidenceRef: quoteRef(f.quote, f.sourcePath),
        concern: f.concern,
        suggestion: f.suggestion,
        evaluatorId: this.id,
      }));

      return {
        criterion: dim.criterion,
        findings,
        score: dim.score,
        confidence: dim.confidence,
        evaluatorIds: [this.id],
      };
    });
  }
}
