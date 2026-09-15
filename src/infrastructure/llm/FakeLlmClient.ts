import type { LlmClient, LlmGenerationOptions } from '../../domain/interfaces/LlmClient.js';

export class FakeLlmClient implements LlmClient {
  private responseGenerator?: (prompt: string) => string;
  private fixedResponse?: string;
  private errorToThrow?: Error;
  private readonly callHistory: Array<{ prompt: string; options?: LlmGenerationOptions }> = [];

  setResponse(response: string): void {
    this.fixedResponse = response;
    this.errorToThrow = undefined;
  }

  setResponseGenerator(fn: (prompt: string) => string): void {
    this.responseGenerator = fn;
    this.errorToThrow = undefined;
  }

  setError(error: Error): void {
    this.errorToThrow = error;
  }

  getCalls() {
    return [...this.callHistory];
  }

  clear(): void {
    this.callHistory.length = 0;
    this.fixedResponse = undefined;
    this.responseGenerator = undefined;
    this.errorToThrow = undefined;
  }

  async generateText(prompt: string, options?: LlmGenerationOptions): Promise<string> {
    this.callHistory.push({ prompt, options });

    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    if (this.responseGenerator) {
      return this.responseGenerator(prompt);
    }

    if (this.fixedResponse !== undefined) {
      return this.fixedResponse;
    }

    // Default valid structured fallback response
    return JSON.stringify({
      dimensions: [
        {
          criterion: 'classResponsibilities',
          score: 4.5,
          confidence: 0.9,
          findings: [
            {
              quote: 'Coordinates spot allocation across floors',
              sourcePath: 'entities[0].responsibility',
              concern: 'Responsibility is slightly broad.',
              suggestion: 'Consider delegating spot search to a dedicated SpotFinder strategy.',
            },
          ],
        },
      ],
      overallSummary: 'High quality architectural design with clean separation of concerns.',
    });
  }
}
