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
import type { SymbolIndex } from '../core/symbolIndex.js';

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

  /**
   * Symbol index for looking up child symbols (optional)
   */
  symbolIndex?: SymbolIndex;
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
  private symbolIndex?: SymbolIndex;

  public constructor(options: YAMLSymbolFormatOptions = {}) {
    this.includeUsages = options.includeUsages ?? true;
    this.includeReferences = options.includeReferences ?? true;
    this.includeMembers = options.includeMembers ?? true;
    this.includeSummary = options.includeSummary ?? true;
    this.symbolIndex = options.symbolIndex;
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
    // Use symbolIndex from options if provided, otherwise fall back to constructor value
    const symbolIndex = options.symbolIndex ?? this.symbolIndex;

    const yamlSymbol = this.formatSymbol(
      symbol,
      includeUsages,
      includeReferences,
      includeMembers,
      includeSummary,
      symbolIndex,
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
   * @param symbolIndex - Symbol index for looking up child symbols (optional)
   * @returns YAML symbol detail object
   */
  private formatSymbol(
    symbol: SymbolMetadata,
    includeUsages: boolean,
    includeReferences: boolean,
    includeMembers: boolean,
    includeSummary: boolean,
    symbolIndex?: SymbolIndex,
  ): YAMLSymbolDetail {
    const yamlSymbol: YAMLSymbolDetail = {
      id: symbol.id,
      inline: symbol.signature || `${symbol.kindString || 'symbol'} ${symbol.name}`,
      line: symbol.line,
    };

    // Add summary if available and requested
    if (includeSummary && symbol.summary) {
      yamlSymbol.summary = symbol.summary;
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
      yamlSymbol.members = this.formatMembers(symbol, symbolIndex);
    }

    // Add references if requested
    if (includeReferences && symbol.references && symbol.references.length > 0) {
      yamlSymbol.references = this.formatReferences(symbol.references, symbolIndex);
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
   * @param symbolIndex - Symbol index for looking up referenced symbols (optional)
   * @returns Array of YAML reference objects
   */
  private formatReferences(
    references: ExternalReference[],
    symbolIndex?: SymbolIndex,
  ): YAMLReference[] {
    return references.map((ref) => {
      const yamlRef: YAMLReference = {
        name: ref.name,
        kind: ref.kind,
        from: ref.from, // Already absolute path from ExternalReference
        line: ref.line,
        module: ref.module,
      };

      // Add preview if available from ExternalReference or generate one
      if (ref.preview) {
        yamlRef.preview = ref.preview;
      } else {
        const preview = this.generateTypePreview(ref, symbolIndex);
        if (preview) {
          yamlRef.preview = preview;
        }
      }

      return yamlRef;
    });
  }

  /**
   * Format members for a symbol
   *
   * Looks up child symbols from symbolIndex and formats them as strings.
   * Returns undefined if symbolIndex is not available or symbol has no children.
   *
   * @param symbol - Symbol metadata
   * @param symbolIndex - Symbol index for looking up child symbols (optional)
   * @returns Array of member strings or undefined
   */
  private formatMembers(symbol: SymbolMetadata, symbolIndex?: SymbolIndex): string[] | undefined {
    if (!symbolIndex || !symbol.childrenIds || symbol.childrenIds.length === 0) {
      return undefined;
    }

    const members: string[] = [];
    for (const childId of symbol.childrenIds) {
      const childSymbol = symbolIndex.getById(childId);
      if (childSymbol) {
        const memberStr = this.formatMember(childSymbol);
        if (memberStr) {
          members.push(memberStr);
        }
      }
    }

    return members.length > 0 ? members : undefined;
  }

  /**
   * Format a single member symbol
   *
   * Uses the symbol's signature if available, otherwise formats from metadata.
   * Appends line number reference in #L<line> format.
   *
   * @param symbol - Child symbol metadata
   * @returns Formatted member string (e.g., "expand(type: Type): TypeExpansionResult #L155")
   */
  private formatMember(symbol: SymbolMetadata): string {
    const line = symbol.line || 0;
    // Use signature if available, otherwise format from metadata
    const signature = symbol.signature || `${symbol.name}`;
    return `${signature} #L${line}`;
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
   * Generate type preview for an external reference
   *
   * Looks up the referenced symbol via symbolIndex and returns its signature.
   * Format: "TypeName ⟶ signature"
   *
   * Returns undefined if:
   * - symbolIndex is not available
   * - referenced symbol is not found
   * - symbol has no signature
   *
   * Note: This infrastructure is ready for when references are populated.
   * In production, references may not yet be collected, so previews will be omitted.
   *
   * @param ref - External reference
   * @param symbolIndex - Symbol index for looking up referenced symbols (optional)
   * @returns Preview string or undefined
   */
  private generateTypePreview(
    ref: ExternalReference,
    symbolIndex?: SymbolIndex,
  ): string | undefined {
    // Return undefined if symbolIndex is not available
    if (!symbolIndex) {
      return undefined;
    }

    // Look up the referenced symbol by name and file
    const matchingSymbols = symbolIndex.query({
      name: ref.name,
      filePath: ref.from,
    });

    // If no matching symbol found or multiple ambiguous matches, return undefined
    if (matchingSymbols.length !== 1) {
      return undefined;
    }

    const referencedSymbol = matchingSymbols[0];

    // Return undefined if symbol has no signature
    if (!referencedSymbol.signature) {
      return undefined;
    }

    // Format as "TypeName ⟶ signature"
    return `${ref.name} ⟶ ${referencedSymbol.signature}`;
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
