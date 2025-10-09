/**
 * YAML formatter for describe_symbol tool output
 *
 * Formats SymbolMetadata as YAML with structure optimized for AI consumption.
 * Includes inline signatures, usage locations, external references, and members.
 *
 * Output format (from POC):
 * ```yaml
 * id: "aB3xYz9p"  # 8-char hash
 * inline: "class TypeExpander"
 * line: 92
 * summary: "TypeExpander - Pure type expansion..."
 * usages:
 *   - file: /path/to/typeExpander.ts
 *     lines: "[360,368]"
 *     # kind field absent = actual usage
 *   - file: /path/to/index.ts
 *     lines: "[2]"
 *     kind: import  # only when it's an import
 * members:
 *   - "expand(type: Type): TypeExpansionResult #L155"
 * references:
 *   - name: ArrayExpander
 *     kind: class
 *     from: /path/to/ArrayExpander.ts
 *     line: 72
 *     module: ./expanders/ArrayExpander.js
 *     preview: "ArrayExpander ⟶ { config: ...; expand: ... }"
 * ```
 */

import { stringify as yamlStringify } from 'yaml';
import type { SymbolMetadata, SymbolUsage, ExternalReference } from '../types/symbols.js';

/**
 * YAML usage data structure
 */
interface YAMLUsage {
  file: string; // absolute path
  lines: string; // "[8,14,23]" format
  kind?: 'import'; // only include when it's an import
}

/**
 * YAML reference data structure
 */
interface YAMLReference {
  name: string;
  kind: string;
  from: string; // absolute path
  line?: number;
  module?: string;
  preview?: string;
}

/**
 * YAML symbol detail structure
 */
interface YAMLSymbolDetail {
  id: string;
  inline: string;
  line?: number;
  summary?: string;
  usages?: YAMLUsage[];
  members?: string[];
  references?: YAMLReference[];
}

/**
 * Options for YAML symbol formatting
 */
export interface YAMLSymbolFormatOptions {
  /**
   * Include usage locations (default: true)
   */
  includeUsages?: boolean;

  /**
   * Include external references (default: true)
   */
  includeReferences?: boolean;

  /**
   * Include members for interfaces/classes/types (default: true)
   */
  includeMembers?: boolean;

  /**
   * Include summary/documentation (default: true)
   */
  includeSummary?: boolean;
}

/**
 * YAML formatter for SymbolMetadata
 *
 * Transforms SymbolMetadata into YAML format for AI-optimized symbol description.
 */
export class YAMLDescribeSymbolFormatter {
  private includeUsages: boolean;
  private includeReferences: boolean;
  private includeMembers: boolean;
  private includeSummary: boolean;

  public constructor(options: YAMLSymbolFormatOptions = {}) {
    this.includeUsages = options.includeUsages ?? true;
    this.includeReferences = options.includeReferences ?? true;
    this.includeMembers = options.includeMembers ?? true;
    this.includeSummary = options.includeSummary ?? true;
  }

  /**
   * Format symbol metadata as YAML
   *
   * @param symbol - Symbol metadata to format
   * @param options - Formatting options (overrides constructor options)
   * @returns YAML formatted string
   */
  public format(symbol: SymbolMetadata, options: YAMLSymbolFormatOptions = {}): string {
    const includeUsages = options.includeUsages ?? this.includeUsages;
    const includeReferences = options.includeReferences ?? this.includeReferences;
    const includeMembers = options.includeMembers ?? this.includeMembers;
    const includeSummary = options.includeSummary ?? this.includeSummary;

    const yamlSymbol = this.formatSymbol(
      symbol,
      includeUsages,
      includeReferences,
      includeMembers,
      includeSummary,
    );

    return yamlStringify(yamlSymbol, {
      lineWidth: 0, // Disable line wrapping for long signatures
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
    });
  }

  /**
   * Format a single symbol into YAML structure
   *
   * @param symbol - Symbol metadata
   * @param includeUsages - Whether to include usage locations
   * @param includeReferences - Whether to include external references
   * @param includeMembers - Whether to include members
   * @param includeSummary - Whether to include summary
   * @returns YAML symbol detail object
   */
  private formatSymbol(
    symbol: SymbolMetadata,
    includeUsages: boolean,
    includeReferences: boolean,
    includeMembers: boolean,
    includeSummary: boolean,
  ): YAMLSymbolDetail {
    const yamlSymbol: YAMLSymbolDetail = {
      id: symbol.id,
      inline: symbol.signature || `${symbol.kindString || 'symbol'} ${symbol.name}`,
      line: symbol.line,
    };

    // Add summary if available and requested
    if (includeSummary && symbol.signature) {
      // Extract summary from signature or use a generated one
      const summary = this.generateSummary(symbol);
      if (summary) {
        yamlSymbol.summary = summary;
      }
    }

    // Add usages if requested
    if (includeUsages && symbol.usages && symbol.usages.length > 0) {
      yamlSymbol.usages = this.formatUsages(symbol.usages);
    }

    // Add members if requested and symbol has children
    if (includeMembers && symbol.childrenIds && symbol.childrenIds.length > 0) {
      // Note: Members formatting would require access to child symbols
      // For now, we'll skip this as it requires additional context
      // This is a SEAM for future enhancement
      yamlSymbol.members = this.formatMembers(symbol);
    }

    // Add references if requested
    if (includeReferences && symbol.references && symbol.references.length > 0) {
      yamlSymbol.references = this.formatReferences(symbol.references);
    }

    return yamlSymbol;
  }

  /**
   * Format usage locations into YAML structure
   *
   * Groups usage lines by file and formats as "[8,14,23]"
   * Only includes `kind: import` when usage is an import
   *
   * @param usages - Array of symbol usages
   * @returns Array of YAML usage objects
   */
  private formatUsages(usages: SymbolUsage[]): YAMLUsage[] {
    return usages.map((usage) => {
      const yamlUsage: YAMLUsage = {
        file: usage.file, // Already absolute path from SymbolUsage
        lines: this.formatLineArray(usage.lines),
      };

      // Only include kind field when it's an import
      if (usage.kind === 'import') {
        yamlUsage.kind = 'import';
      }

      return yamlUsage;
    });
  }

  /**
   * Format external references into YAML structure
   *
   * @param references - Array of external references
   * @returns Array of YAML reference objects
   */
  private formatReferences(references: ExternalReference[]): YAMLReference[] {
    return references.map((ref) => {
      const yamlRef: YAMLReference = {
        name: ref.name,
        kind: ref.kind,
        from: ref.from, // Already absolute path from ExternalReference
        line: ref.line,
        module: ref.module,
      };

      // Add preview if we can generate one
      const preview = this.generateTypePreview(ref);
      if (preview) {
        yamlRef.preview = preview;
      }

      return yamlRef;
    });
  }

  /**
   * Format members for a symbol
   *
   * Note: This is a SEAM for future enhancement.
   * Currently returns empty array as member information is not directly
   * available in SymbolMetadata without additional context.
   *
   * @param _symbol - Symbol metadata
   * @returns Array of member strings
   */
  private formatMembers(_symbol: SymbolMetadata): string[] | undefined {
    // TODO: Implement member extraction when child symbol access is available
    // For now, return undefined to omit the field entirely
    return undefined;
  }

  /**
   * Format array of line numbers as string "[8,14,23]"
   *
   * @param lines - Array of line numbers
   * @returns Formatted line array string
   */
  private formatLineArray(lines: number[]): string {
    return `[${lines.join(',')}]`;
  }

  /**
   * Generate summary for a symbol
   *
   * @param symbol - Symbol metadata
   * @returns Summary string or undefined
   */
  private generateSummary(symbol: SymbolMetadata): string | undefined {
    // Use signature as summary if available
    if (symbol.signature) {
      return `${symbol.name} - ${symbol.signature}`;
    }

    return undefined;
  }

  /**
   * Generate type preview for an external reference
   *
   * Format: "TypeName ⟶ \{ prop1: type1; prop2: type2; ... \}"
   *
   * Note: This is a SEAM for future enhancement.
   * Currently returns undefined as type expansion is not available here.
   *
   * @param _ref - External reference
   * @returns Preview string or undefined
   */
  private generateTypePreview(_ref: ExternalReference): string | undefined {
    // TODO: Implement type preview generation with type expander
    // For now, return undefined to omit the field
    return undefined;
  }
}

/**
 * Create a YAML symbol formatter instance
 *
 * @param options - Formatter options
 * @returns YAMLDescribeSymbolFormatter instance
 */
export function createYAMLDescribeSymbolFormatter(
  options: YAMLSymbolFormatOptions = {},
): YAMLDescribeSymbolFormatter {
  return new YAMLDescribeSymbolFormatter(options);
}

/**
 * Format symbol metadata as YAML (convenience function)
 *
 * @param symbol - Symbol metadata to format
 * @param options - Formatting options
 * @returns YAML formatted string
 */
export function formatSymbolAsYAML(
  symbol: SymbolMetadata,
  options: YAMLSymbolFormatOptions = {},
): string {
  const formatter = createYAMLDescribeSymbolFormatter(options);
  return formatter.format(symbol, options);
}
