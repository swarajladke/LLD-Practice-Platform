/**
 * Evidence Value Object and Reference Types.
 * Enforces that every evaluation finding is honestly grounded:
 * either by a direct cited quote from the submission, or by explicit absence
 * of an expected structure/section.
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

export type EvidenceRef =
  | { readonly kind: 'quote'; readonly evidence: Evidence }
  | { readonly kind: 'absence'; readonly expectedPath: string; readonly note: string };

export function quoteRef(quote: string, sourcePath: string): EvidenceRef {
  return {
    kind: 'quote',
    evidence: Evidence.create(quote, sourcePath),
  };
}

export function absenceRef(expectedPath: string, note: string): EvidenceRef {
  return {
    kind: 'absence',
    expectedPath,
    note,
  };
}
