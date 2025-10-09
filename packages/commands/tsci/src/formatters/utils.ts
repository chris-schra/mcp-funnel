/**
 * Formatting utilities for tsci command output
 */

import type { FormatOptions, UsageLocation, UsageSummary } from './types.js';

/**
 * Estimate token count for text using rough heuristic
 *
 * Uses ~4 characters per token as approximation.
 * This helps AI context planning for token budget management.
 *
 * @param text - Text to estimate tokens for
 * @returns Approximate token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate a signature to a maximum length
 *
 * Preserves the beginning and end of the signature for readability.
 * Adds ellipsis in the middle if truncated.
 *
 * @param signature - Full signature to truncate
 * @param maxLength - Maximum length (default: 120)
 * @returns Truncated signature
 */
export function truncateSignature(signature: string, maxLength: number = 120): string {
  if (signature.length <= maxLength) {
    return signature;
  }

  const ellipsis = '...';
  const halfLength = Math.floor((maxLength - ellipsis.length) / 2);

  return signature.slice(0, halfLength) + ellipsis + signature.slice(signature.length - halfLength);
}

/**
 * Format line numbers into a compact range notation
 *
 * Converts arrays of line numbers into compact string representation:
 * - [1, 2, 3, 5, 6, 10] -\> "1-3, 5-6, 10"
 * - [1, 3, 5] -\> "1, 3, 5"
 * - [1] -\> "1"
 *
 * @param lines - Array of line numbers (will be sorted)
 * @returns Formatted line number string
 */
export function formatLineNumbers(lines: number[]): string {
  if (lines.length === 0) {
    return '';
  }

  // Sort lines to ensure proper range detection
  const sorted = [...lines].sort((a, b) => a - b);

  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    const isLastItem = i === sorted.length;

    if (!isLastItem && current === rangeEnd + 1) {
      // Continue current range
      rangeEnd = current;
    } else {
      // End current range and start new one
      if (rangeStart === rangeEnd) {
        ranges.push(`${rangeStart}`);
      } else if (rangeEnd === rangeStart + 1) {
        // Two consecutive numbers, don't use range notation
        ranges.push(`${rangeStart}, ${rangeEnd}`);
      } else {
        ranges.push(`${rangeStart}-${rangeEnd}`);
      }

      if (!isLastItem) {
        rangeStart = current;
        rangeEnd = current;
      }
    }
  }

  return ranges.join(', ');
}

/**
 * Convert usage locations to usage summaries
 *
 * Groups usages by file and counts occurrences.
 *
 * @param usages - Raw usage locations
 * @returns Usage summaries grouped by file
 */
export function toUsageSummaries(usages: UsageLocation[] | undefined): UsageSummary[] {
  if (!usages || usages.length === 0) {
    return [];
  }

  return usages.map((usage) => ({
    file: usage.file,
    lines: usage.lines,
    count: usage.lines.length,
  }));
}

/**
 * Determine if usages should be included based on options
 *
 * @param options - Format options
 * @returns true if usages should be included
 */
export function shouldIncludeUsages(options: FormatOptions): boolean {
  // Explicit option takes precedence
  if (options.includeUsages !== undefined) {
    return options.includeUsages;
  }

  // Otherwise, include if verbosity is normal or detailed
  const verbosity = options.verbosity ?? 'minimal';
  return verbosity === 'normal' || verbosity === 'detailed';
}

/**
 * Determine if references should be included based on options
 *
 * @param options - Format options
 * @returns true if references should be included
 */
export function shouldIncludeReferences(options: FormatOptions): boolean {
  // Explicit option takes precedence
  if (options.includeReferences !== undefined) {
    return options.includeReferences;
  }

  // Otherwise, include if verbosity is normal or detailed
  const verbosity = options.verbosity ?? 'minimal';
  return verbosity === 'normal' || verbosity === 'detailed';
}

/**
 * Get the maximum depth for nested structures
 *
 * @param options - Format options
 * @returns Maximum depth
 */
export function getMaxDepth(options: FormatOptions): number {
  return options.maxDepth ?? 3;
}

/**
 * Create an inline signature from symbol metadata
 *
 * Formats a symbol into a single-line signature:
 * - "function foo(x: string): number"
 * - "class Bar implements Baz"
 * - "interface Qux extends Base"
 *
 * @param kind - Symbol kind
 * @param name - Symbol name
 * @param signature - Full signature
 * @returns Inline signature string
 */
export function createInlineSignature(kind: string, name: string, signature: string): string {
  // Remove newlines and excessive whitespace
  const normalized = signature.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Format JSON output with consistent indentation
 *
 * @param data - Data to format as JSON
 * @returns Formatted JSON string
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
