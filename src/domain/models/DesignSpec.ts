/**
 * Canonical Low-Level Design Specification.
 *
 * All evaluators operate strictly against this normalized structure.
 * Different submission formats (e.g. structured text, future class diagram)
 * parse their raw inputs into this canonical spec, keeping evaluators decoupled
 * from the submission mechanism.
 */

export interface EntityDefinition {
  readonly name: string;
  readonly responsibility: string;
  readonly attributes: readonly string[];
  readonly methods: readonly string[];
}

export type RelationshipType = 'has-a' | 'is-a' | 'uses';

export interface RelationshipDefinition {
  readonly from: string;
  readonly to: string;
  readonly type: RelationshipType;
  readonly note?: string;
}

export interface InterfaceDefinition {
  readonly name: string;
  readonly purpose: string;
  readonly methods: readonly string[];
}

export interface TradeoffDefinition {
  readonly decision: string;
  readonly alternative: string;
  readonly why: string;
}

export interface DesignSpec {
  readonly assumptions: readonly string[];
  readonly entities: readonly EntityDefinition[];
  readonly relationships: readonly RelationshipDefinition[];
  readonly interfaces: readonly InterfaceDefinition[];
  readonly tradeoffs: readonly TradeoffDefinition[];
  readonly extensibility: string;
}
