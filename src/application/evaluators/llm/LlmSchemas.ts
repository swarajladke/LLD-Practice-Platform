import { z } from 'zod';
import { RUBRIC_DIMENSIONS } from '../../../domain/models/Rubric.js';

/**
 * Zod schema for a single finding emitted by the LLM evaluator.
 * Enforces non-empty quote, sourcePath, concern, and constructive suggestion.
 */
export const LlmFindingSchema = z.object({
  quote: z.string().min(1, 'Quote must not be empty'),
  sourcePath: z.string().min(1, 'Source path must not be empty'),
  concern: z.string().min(1, 'Concern must not be empty'),
  suggestion: z.string().min(1, 'Suggestion must not be empty'),
});

export type LlmFinding = z.infer<typeof LlmFindingSchema>;

/**
 * Zod schema for a single dimension evaluation emitted by LLM.
 */
export const LlmDimensionResultSchema = z.object({
  criterion: z.enum(RUBRIC_DIMENSIONS),
  score: z.number().min(0).max(5),
  confidence: z.number().min(0).max(1),
  findings: z.array(LlmFindingSchema),
});

export type LlmDimensionResult = z.infer<typeof LlmDimensionResultSchema>;

/**
 * Zod schema for the full LLM evaluation response.
 * Temperature 0 + strict Zod validation.
 */
export const LlmEvaluationResponseSchema = z.object({
  dimensions: z.array(LlmDimensionResultSchema),
  overallSummary: z.string().min(1, 'Overall summary must not be empty'),
});

export type LlmEvaluationResponse = z.infer<typeof LlmEvaluationResponseSchema>;
