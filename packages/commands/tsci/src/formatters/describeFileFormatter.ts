/**
 * Formatter for describe_file tool output
 *
 * Transforms symbol metadata into AI-optimized file descriptions with
 * configurable verbosity levels. Defaults to minimal output to optimize
 * token usage.
 */

import type {
  DescribeFileOutput,
  ExternalReferenceSummary,
  FormatOptions,
  IDescribeFileFormatter,
  SymbolMetadata,
  SymbolSummary,
} from './types.js';
import {
  createInlineSignature,
  estimateTokens,
  formatJson,
  shouldIncludeReferences,
  shouldIncludeUsages,
  toUsageSummaries,
} from './utils.js';

/**
 * Default implementation of IDescribeFileFormatter
 *
 * Formats symbol metadata for a single file with progressive disclosure:
 * - minimal (default): Symbol signatures and line numbers only (~100-200 tokens)
 * - normal: + usage locations (~300-500 tokens)
 * - detailed: + external references with previews (~500-1000 tokens)
 */
export class DescribeFileFormatter implements IDescribeFileFormatter {
  /**
   * Format symbol metadata into file description output
   *
   * @param symbols - Array of symbol metadata for the file
   * @param options - Formatting options (defaults to minimal verbosity)
   * @returns Formatted file description with token estimate
   */
  public format(symbols: SymbolMetadata[], options: FormatOptions = {}): DescribeFileOutput {
    const includeUsages = shouldIncludeUsages(options);
    const includeReferences = shouldIncludeReferences(options);

    // Extract file path from first symbol (all symbols should be from same file)
    const filePath = symbols.length > 0 ? symbols[0].filePath || '' : '';

    // Format symbol summaries
    const symbolSummaries: SymbolSummary[] = symbols.map((symbol) =>
      this.formatSymbolSummary(symbol, includeUsages),
    );

    // Collect external references if needed
    const references = includeReferences ? this.collectExternalReferences(symbols) : undefined;

    // Build output object
    const output: DescribeFileOutput = {
      file: filePath,
      symbols: symbolSummaries,
      ...(references && references.length > 0 && { references }),
      tokenEstimate: 0, // Will be calculated below
    };

    // Calculate token estimate
    const jsonOutput = formatJson(output);
    output.tokenEstimate = estimateTokens(jsonOutput);

    return output;
  }

  /**
   * Format a single symbol into a summary
   *
   * @param symbol - Symbol metadata
   * @param includeUsages - Whether to include usage information
   * @returns Symbol summary
   */
  private formatSymbolSummary(symbol: SymbolMetadata, includeUsages: boolean): SymbolSummary {
    const inline = createInlineSignature(
      symbol.kindString || 'unknown',
      symbol.name,
      symbol.signature || '',
    );

    const summary: SymbolSummary = {
      inline,
      line: symbol.line || 0,
    };

    // Add usages if requested
    if (includeUsages && symbol.usages && symbol.usages.length > 0) {
      summary.usages = toUsageSummaries(symbol.usages);
    }

    return summary;
  }

  /**
   * Collect and deduplicate external references from all symbols
   *
   * @param symbols - Array of symbol metadata
   * @returns Deduplicated array of external references
   */
  private collectExternalReferences(symbols: SymbolMetadata[]): ExternalReferenceSummary[] {
    const referencesMap = new Map<string, ExternalReferenceSummary>();

    for (const symbol of symbols) {
      if (symbol.references) {
        for (const ref of symbol.references) {
          // Use combination of name and module as unique key
          const key = `${ref.name}:${ref.module}`;
          if (!referencesMap.has(key)) {
            // Convert ExternalReference to ExternalReferenceSummary
            referencesMap.set(key, {
              name: ref.name,
              source: ref.module,
              kind: ref.kind,
            });
          }
        }
      }
    }

    return Array.from(referencesMap.values());
  }
}

/**
 * Create a default describe_file formatter instance
 *
 * @returns New DescribeFileFormatter instance
 */
export function createDescribeFileFormatter(): IDescribeFileFormatter {
  return new DescribeFileFormatter();
}

/**
 * Format symbol metadata for a file (convenience function)
 *
 * @param symbols - Array of symbol metadata
 * @param options - Formatting options
 * @returns Formatted file description
 */
export function formatFile(
  symbols: SymbolMetadata[],
  options: FormatOptions = {},
): DescribeFileOutput {
  const formatter = createDescribeFileFormatter();
  return formatter.format(symbols, options);
}
