import { Type, UnionType } from 'typedoc';
import { ExpansionContext, ExpansionResult } from '../types.js';

/**
 * UnionExpander handles the expansion of TypeScript union types.
 *
 * This class is responsible for expanding union types (Type1 | Type2 | Type3)
 * with intelligent handling of:
 * - Recursive expansion of each union member
 * - Deduplication of identical types
 * - Maintains original order (simplified version - no sorting)
 *
 * Cherry-picked from POC: src/services/typeExpander/expanders/UnionExpander.ts (lines 69-175)
 * Simplified: No sorting, just maintain order
 *
 * @example Basic usage
 * ```typescript
 * const expander = new UnionExpander();
 * const result = expander.expand(unionType, context, expandFn);
 * // Result: "string | number | CustomType"
 * ```
 */
export class UnionExpander {
  /**
   * Expands a union type into its string representation.
   *
   * This method recursively expands each member of the union type using the
   * provided expansion function, then combines them with the union operator (|).
   * It handles deduplication based on configuration.
   *
   * @param type - The UnionType to expand
   * @param context - The current expansion context (depth, visited types, etc.)
   * @param expandFn - Function to recursively expand nested types
   * @returns ExpansionResult with the expanded union string and metadata
   *
   * @example
   * ```typescript
   * const result = expander.expand(
   *   unionType,
   *   { depth: 0, visitedTypes: new Set() },
   *   (t, ctx) => ({ expanded: t.toString(), truncated: false })
   * );
   * ```
   */
  public expand(
    type: UnionType,
    context: ExpansionContext,
    expandFn: (type: Type, context: ExpansionContext) => ExpansionResult,
  ): ExpansionResult {
    // Expand each union member
    const expandedMembers: Array<{
      expanded: string;
      truncated: boolean;
      truncationReason?: 'cycle' | 'depth';
    }> = [];

    let anyTruncated = false;
    let truncationReason: ExpansionResult['truncationReason'];

    for (const memberType of type.types) {
      const result = expandFn(memberType, context);
      expandedMembers.push(result);

      if (result.truncated) {
        anyTruncated = true;
        truncationReason = result.truncationReason;
      }
    }

    // Extract expanded strings
    let expandedTypes = expandedMembers.map((m) => m.expanded);

    // Deduplicate
    expandedTypes = this.deduplicateTypes(expandedTypes);

    // Return the full union (no sorting in simplified version)
    return {
      expanded: expandedTypes.join(' | '),
      truncated: anyTruncated,
      truncationReason,
    };
  }

  /**
   * Deduplicates identical type strings in the union.
   *
   * This prevents redundant types like "string | number | string" from
   * appearing in the output, reducing them to "string | number".
   *
   * @param types - Array of type strings to deduplicate
   * @returns Array of unique type strings, preserving order of first occurrence
   *
   * @example
   * ```typescript
   * deduplicateTypes(['string', 'number', 'string']);
   * // Returns: ['string', 'number']
   * ```
   */
  private deduplicateTypes(types: string[]): string[] {
    const seen = new Set<string>();
    const deduplicated: string[] = [];

    for (const type of types) {
      if (!seen.has(type)) {
        seen.add(type);
        deduplicated.push(type);
      }
    }

    return deduplicated;
  }
}
