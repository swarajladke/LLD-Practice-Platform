import { z } from 'zod';
import type {
  SubmissionFormat,
  FormatParseResult,
  FormatValidationError,
} from '../../domain/interfaces/SubmissionFormat.js';
import type { DesignSpec } from '../../domain/models/DesignSpec.js';

const EntitySchema = z.object({
  name: z.string().trim().min(1, 'Entity name cannot be empty'),
  responsibility: z.string().trim().min(1, 'Entity responsibility cannot be empty'),
  attributes: z.array(z.string().trim().min(1)).default([]),
  methods: z.array(z.string().trim().min(1)).default([]),
});

const RelationshipSchema = z.object({
  from: z.string().trim().min(1, 'Relationship "from" cannot be empty'),
  to: z.string().trim().min(1, 'Relationship "to" cannot be empty'),
  type: z.enum(['has-a', 'is-a', 'uses'], {
    errorMap: () => ({ message: 'Relationship type must be "has-a", "is-a", or "uses"' }),
  }),
  note: z.string().trim().optional(),
});

const InterfaceSchema = z.object({
  name: z.string().trim().min(1, 'Interface name cannot be empty'),
  purpose: z.string().trim().min(1, 'Interface purpose cannot be empty'),
  methods: z.array(z.string().trim().min(1)).default([]),
});

const TradeoffSchema = z.object({
  decision: z.string().trim().min(1, 'Tradeoff decision cannot be empty'),
  alternative: z.string().trim().min(1, 'Alternative considered cannot be empty'),
  why: z.string().trim().min(1, 'Tradeoff reasoning (why) cannot be empty'),
});

export const RawDesignSpecSchema = z.object({
  assumptions: z.array(z.string().trim().min(1)).default([]),
  entities: z.array(EntitySchema).min(1, 'At least 1 entity is required in submission'),
  relationships: z.array(RelationshipSchema).default([]),
  interfaces: z.array(InterfaceSchema).default([]),
  tradeoffs: z.array(TradeoffSchema).min(2, 'At least 2 tradeoffs are required in submission'),
  extensibility: z.string().trim().min(1, 'Extensibility section cannot be empty or whitespace'),
});

const MAX_PAYLOAD_SIZE_CHARS = 100_000;

export class StructuredTextFormat implements SubmissionFormat {
  readonly formatId = 'structured-text';

  parseAndValidate(rawPayload: unknown): FormatParseResult {
    if (!rawPayload || typeof rawPayload !== 'object') {
      return {
        success: false,
        errors: [{ path: 'root', message: 'Payload must be a non-empty JSON object' }],
      };
    }

    const rawString = JSON.stringify(rawPayload);
    if (rawString.length > MAX_PAYLOAD_SIZE_CHARS) {
      return {
        success: false,
        errors: [
          {
            path: 'root',
            message: `Payload exceeds maximum allowable size (${rawString.length} chars, limit is ${MAX_PAYLOAD_SIZE_CHARS})`,
          },
        ],
      };
    }

    const parsed = RawDesignSpecSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const errors: FormatValidationError[] = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      return {
        success: false,
        errors,
      };
    }

    const spec: DesignSpec = {
      assumptions: Object.freeze(parsed.data.assumptions),
      entities: Object.freeze(
        parsed.data.entities.map((e) => ({
          name: e.name,
          responsibility: e.responsibility,
          attributes: Object.freeze(e.attributes),
          methods: Object.freeze(e.methods),
        }))
      ),
      relationships: Object.freeze(parsed.data.relationships),
      interfaces: Object.freeze(
        parsed.data.interfaces.map((i) => ({
          name: i.name,
          purpose: i.purpose,
          methods: Object.freeze(i.methods),
        }))
      ),
      tradeoffs: Object.freeze(parsed.data.tradeoffs),
      extensibility: parsed.data.extensibility,
    };

    return {
      success: true,
      spec,
    };
  }
}
