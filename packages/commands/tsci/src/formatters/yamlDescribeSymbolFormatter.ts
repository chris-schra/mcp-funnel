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
import { createPathMapping } from './pathMapper.js';

/**
 * YAML usage data structure
 */
interface YAMLUsage {
  file: string; // absolute path
  lines: string; // "[8,14,23]" format
  kind?: 'import'; // only include when it's an import
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
  /**
   * Compact reference format:
   * `"\{kind\} \{name\} from \{file\}:L\{line\} module \{module\} ⟶ \{preview\}"`
   */
  references?: string[];
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

    if (includeSummary && symbol.summary) {
      yamlSymbol.summary = symbol.summary;
    }

    const pathMapping = this.collectPathsForMapping(symbol, includeUsages, includeReferences);

    if (includeUsages && symbol.usages && symbol.usages.length > 0) {
      yamlSymbol.usages = this.formatUsages(symbol.usages, pathMapping);
    }

    if (includeMembers && symbol.childrenIds && symbol.childrenIds.length > 0) {
      yamlSymbol.members = this.formatMembers(symbol, symbolIndex);
    }

    if (includeReferences && symbol.references && symbol.references.length > 0) {
      yamlSymbol.references = this.formatReferences(symbol.references, symbolIndex, pathMapping);
    }

    return yamlSymbol;
  }

  /**
   * Collect all paths from symbol and create path mapping
   *
   * @param symbol - Symbol metadata
   * @param includeUsages - Whether usages are included
   * @param includeReferences - Whether references are included
   * @returns Path mapping from absolute to relative paths
   */
  private collectPathsForMapping(
    symbol: SymbolMetadata,
    includeUsages: boolean,
    includeReferences: boolean,
  ): Map<string, string> {
    const allPaths: string[] = [];

    if (symbol.filePath) {
      allPaths.push(symbol.filePath);
    }
    if (includeUsages && symbol.usages) {
      allPaths.push(...symbol.usages.map((u) => u.file));
    }
    if (includeReferences && symbol.references) {
      allPaths.push(...symbol.references.map((r) => r.from));
    }

    return createPathMapping(allPaths);
  }

  /**
   * Format usage locations into YAML structure
   *
   * @param usages - Array of symbol usages
   * @param pathMapping - Map from absolute to relative paths
   * @returns Array of YAML usage objects with lines as "[8,14,23]"
   */
  private formatUsages(usages: SymbolUsage[], pathMapping: Map<string, string>): YAMLUsage[] {
    return usages.map((usage) => {
      const yamlUsage: YAMLUsage = {
        file: pathMapping.get(usage.file) || usage.file,
        lines: this.formatLineArray(usage.lines),
      };
      if (usage.kind === 'import') {
        yamlUsage.kind = 'import';
      }
      return yamlUsage;
    });
  }

  /**
   * Format external references into compact string format
   *
   * @param references - Array of external references
   * @param symbolIndex - Symbol index for preview lookups (optional)
   * @param pathMapping - Map from absolute to relative paths
   * @returns Strings like "\{kind\} \{name\} from \{file\}:L\{line\} module \{module\} ⟶ \{preview\}"
   */
  private formatReferences(
    references: ExternalReference[],
    symbolIndex?: SymbolIndex,
    pathMapping?: Map<string, string>,
  ): string[] {
    return references.map((ref) => {
      const filePath = pathMapping?.get(ref.from) || ref.from;
      let str = `${ref.kind} ${ref.name} from ${filePath}:L${ref.line}`;
      if (ref.module) {
        str += ` module ${ref.module}`;
      }
      const preview = ref.preview || this.generateTypePreview(ref, symbolIndex);
      if (preview) {
        str += ` ${preview}`;
      }
      return str;
    });
  }

  /**
   * Format members for a symbol
   *
   * @param symbol - Symbol metadata with childrenIds
   * @param symbolIndex - Symbol index for child lookups (optional)
   * @returns Member strings like "methodName(...): ReturnType #L123" or undefined
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
   * @param symbol - Child symbol metadata
   * @returns String like "methodName(...): ReturnType #L123"
   */
  private formatMember(symbol: SymbolMetadata): string {
    const line = symbol.line || 0;
    const signature = symbol.signature || `${symbol.name}`;
    return `${signature} #L${line}`;
  }

  /**
   * Format line numbers as "[8,14,23]"
   *
   * @param lines - Array of line numbers
   * @returns Formatted string
   */
  private formatLineArray(lines: number[]): string {
    return `[${lines.join(',')}]`;
  }

  /**
   * Generate type preview for external reference by looking up in symbolIndex
   *
   * @param ref - External reference to look up
   * @param symbolIndex - Symbol index for lookups (optional)
   * @returns Preview string "⟶ signature" or undefined if not found
   */
  private generateTypePreview(
    ref: ExternalReference,
    symbolIndex?: SymbolIndex,
  ): string | undefined {
    if (!symbolIndex) {
      return undefined;
    }
    const matchingSymbols = symbolIndex.query({
      name: ref.name,
      filePath: ref.from,
    });
    if (matchingSymbols.length !== 1) {
      return undefined;
    }
    const referencedSymbol = matchingSymbols[0];
    if (!referencedSymbol.signature) {
      return undefined;
    }
    return `⟶ ${referencedSymbol.signature}`;
  }
}

/**
 * Create YAML formatter instance
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
 * Format symbol as YAML (convenience function)
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
