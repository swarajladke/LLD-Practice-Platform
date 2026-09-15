/**
 * Evidence Value Object.
 * Enforces that every dimension result grounds its score in the learner's own submission.
 * Rejects blank quotes or blank sourcePaths at construction.
 */
export class Evidence {
  readonly quote: string;
  readonly sourcePath: string;

  private constructor(quote: string, sourcePath: string) {
    this.quote = quote;
    this.sourcePath = sourcePath;
  }

  static create(quote: string, sourcePath: string): Evidence {
    if (!quote || quote.trim().length === 0) {
      throw new Error('Evidence quote cannot be empty or whitespace');
    }
    if (!sourcePath || sourcePath.trim().length === 0) {
      throw new Error('Evidence sourcePath cannot be empty or whitespace');
    }
    return new Evidence(quote.trim(), sourcePath.trim());
  }

  toJSON() {
    return {
      quote: this.quote,
      sourcePath: this.sourcePath,
    };
  }
}
