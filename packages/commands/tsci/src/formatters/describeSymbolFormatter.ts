/**
 * Formatter for describe_symbol tool output
 *
 * Transforms symbol metadata into AI-optimized symbol descriptions with
 * configurable verbosity levels. Defaults to minimal output to optimize
 * token usage.
 */

import type {
  DescribeSymbolOutput,
  FormatOptions,
  IDescribeSymbolFormatter,
  SymbolDetail,
  SymbolMetadata,
} from './types.js';
import {
  estimateTokens,
  formatJson,
  shouldIncludeReferences,
  shouldIncludeUsages,
  toUsageSummaries,
} from './utils.js';

/**
 * Default implementation of IDescribeSymbolFormatter
 *
 * Formats symbol metadata for a single symbol with progressive disclosure:
 * - minimal (default): Symbol signature only (~50-100 tokens)
 * - normal: + usage locations (~150-300 tokens)
 * - detailed: + external references with previews (~300-600 tokens)
 */
export class DescribeSymbolFormatter implements IDescribeSymbolFormatter {
  /**
   * Format symbol metadata into symbol description output
   *
   * @param symbol - Symbol metadata to format
   * @param options - Formatting options (defaults to minimal verbosity)
   * @returns Formatted symbol description with token estimate
   */
  public format(symbol: SymbolMetadata, options: FormatOptions = {}): DescribeSymbolOutput {
    const includeUsages = shouldIncludeUsages(options);
    const includeReferences = shouldIncludeReferences(options);

    // Create symbol detail
    const symbolDetail: SymbolDetail = {
      id: symbol.id,
      name: symbol.name,
      kind: symbol.kindString || 'unknown',
      signature: symbol.signature || '',
      file: symbol.filePath || '',
      line: symbol.line || 0,
      isExported: symbol.isExported,
    };

    // Build output object
    const output: DescribeSymbolOutput = {
      symbol: symbolDetail,
      tokenEstimate: 0, // Will be calculated below
    };

    // Add usages if requested
    if (includeUsages && symbol.usages && symbol.usages.length > 0) {
      output.usages = toUsageSummaries(symbol.usages);
    }

    // Add references if requested
    if (includeReferences && symbol.references && symbol.references.length > 0) {
      // Convert ExternalReference[] to ExternalReferenceSummary[]
      output.references = symbol.references.map((ref) => ({
        name: ref.name,
        source: ref.module,
        kind: ref.kind,
      }));
    }

    // Calculate token estimate
    const jsonOutput = formatJson(output);
    output.tokenEstimate = estimateTokens(jsonOutput);

    return output;
  }
}

/**
 * Create a default describe_symbol formatter instance
 *
 * @returns New DescribeSymbolFormatter instance
 */
export function createDescribeSymbolFormatter(): IDescribeSymbolFormatter {
  return new DescribeSymbolFormatter();
}

/**
 * Format symbol metadata (convenience function)
 *
 * @param symbol - Symbol metadata to format
 * @param options - Formatting options
 * @returns Formatted symbol description
 */
export function formatSymbol(
  symbol: SymbolMetadata,
  options: FormatOptions = {},
): DescribeSymbolOutput {
  const formatter = createDescribeSymbolFormatter();
  return formatter.format(symbol, options);
}
