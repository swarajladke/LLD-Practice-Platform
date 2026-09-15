/**
 * LLM client abstraction for structured text generation.
 * Enables zero-API-key offline testing via FakeLlmClient.
 */
export interface LlmGenerationOptions {
  readonly temperature?: number;
  readonly systemPrompt?: string;
}

export interface LlmClient {
  generateText(prompt: string, options?: LlmGenerationOptions): Promise<string>;
}
