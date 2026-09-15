import type { DesignSpec } from '../models/DesignSpec.js';

export interface FormatValidationError {
  readonly path: string;
  readonly message: string;
}

export interface FormatParseResult {
  readonly success: boolean;
  readonly spec?: DesignSpec;
  readonly errors?: readonly FormatValidationError[];
}

/**
 * Strategy interface for parsing and validating raw submissions into a canonical DesignSpec.
 * Answers Change Test A:
 * If submission format changes from structured text to class diagrams or code,
 * only a new SubmissionFormat implementation is added. All evaluators continue
 * operating unchanged against the canonical DesignSpec.
 */
export interface SubmissionFormat {
  readonly formatId: string;
  parseAndValidate(rawPayload: unknown): FormatParseResult;
}
