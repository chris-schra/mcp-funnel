/**
 * Summary extractor for filtering JSDoc comments from TypeDoc reflections
 *
 * SEAM: Extension point for future smart filtering.
 * - Phase 1: PassthroughSummaryExtractor (ship now)
 * - Phase 2: SmartSummaryExtractor with LLM filtering (future)
 */

import type { Reflection } from 'typedoc';

/**
 * Interface for extracting summaries from TypeDoc reflections.
 *
 * SEAM: Extension point for future smart filtering.
 * - Phase 1: PassthroughSummaryExtractor (ship now)
 * - Phase 2: SmartSummaryExtractor with LLM filtering (future)
 */
export interface SummaryExtractor {
  /**
   * Extract summary from a TypeDoc reflection.
   *
   * Accepts any Reflection type (DeclarationReflection, SignatureReflection, etc.)
   * since comment extraction works on the base Reflection type.
   *
   * @param reflection - TypeDoc reflection to extract from
   * @returns Summary text, or undefined if no summary or filtered out
   */
  extract(reflection: Reflection): string | undefined;
}

/**
 * Passthrough implementation - returns raw JSDoc summary without filtering.
 *
 * This is the Phase 1 implementation. All summaries are included regardless
 * of redundancy or value.
 */
export class PassthroughSummaryExtractor implements SummaryExtractor {
  public extract(reflection: Reflection): string | undefined {
    // TypeDoc stores JSDoc comments in reflection.comment
    // summary is a CommentDisplayPart array that needs to be concatenated
    const summaryParts = reflection.comment?.summary;
    if (!summaryParts || summaryParts.length === 0) {
      return undefined;
    }

    // Concatenate all summary parts into single string
    return summaryParts.map((part) => part.text).join('');
  }
}

/**
 * Smart implementation stub - filters redundant summaries using LLM.
 *
 * Phase 2 feature. Uncomment and implement when ready:
 * - Check if summary adds value beyond name/signature
 * - Filter "This is the Foo interface" style summaries
 * - Keep architectural/contextual information
 */
export class SmartSummaryExtractor implements SummaryExtractor {
  public extract(reflection: Reflection): string | undefined {
    // TODO Phase 2: Implement smart filtering
    // For now, delegate to passthrough
    const passthrough = new PassthroughSummaryExtractor();
    return passthrough.extract(reflection);
  }
}
