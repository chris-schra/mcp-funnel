/**
 * Graph builder for extracting dependency relationships from symbol metadata
 *
 * Builds file-level dependency graphs by analyzing import and usage patterns.
 */

import type { SymbolMetadata } from '../../formatters/types.js';
import type { DependencyGraph, FileRelationship, IGraphBuilder } from './types.js';

/**
 * Builds dependency graphs from symbol metadata
 *
 * Analyzes import declarations and symbol usages to construct file relationships.
 * Deduplicates relationships and tracks which symbols are involved.
 */
export class GraphBuilder implements IGraphBuilder {
  /**
   * Build a file-level dependency graph from symbols
   *
   * @param symbols - Array of symbol metadata
   * @returns Dependency graph with files and relationships
   */
  public buildGraph(symbols: SymbolMetadata[]): DependencyGraph {
    if (symbols.length === 0) {
      return {
        files: [],
        fileRelationships: [],
      };
    }

    // Extract all unique files from symbols
    const files = this.extractFiles(symbols);

    // Extract import relationships
    const importRelationships = this.extractImports(symbols);

    // Extract usage relationships
    const usageRelationships = this.extractUsages(symbols);

    // Combine and deduplicate
    const allRelationships = [...importRelationships, ...usageRelationships];
    const deduplicatedRelationships = this.deduplicateRelationships(allRelationships);

    return {
      files,
      fileRelationships: deduplicatedRelationships,
    };
  }

  /**
   * Extract all unique files from symbol metadata
   *
   * @param symbols - Array of symbol metadata
   * @returns Array of unique file paths
   */
  private extractFiles(symbols: SymbolMetadata[]): string[] {
    const fileSet = new Set<string>();

    for (const symbol of symbols) {
      if (symbol.filePath) {
        fileSet.add(symbol.filePath);
      }

      // Add files from usages
      if (symbol.usages) {
        for (const usage of symbol.usages) {
          fileSet.add(usage.file);
        }
      }
    }

    return Array.from(fileSet).sort();
  }

  /**
   * Extract import relationships from symbols
   *
   * Looks for usage patterns that indicate imports (typically at top of file).
   * In TypeScript analysis, imports are detected when a symbol from another file
   * is used in the current file.
   *
   * @param symbols - Array of symbol metadata
   * @returns Array of file import relationships
   */
  private extractImports(symbols: SymbolMetadata[]): FileRelationship[] {
    const relationships: FileRelationship[] = [];

    for (const symbol of symbols) {
      if (!symbol.usages || symbol.usages.length === 0 || !symbol.filePath) {
        continue;
      }

      const sourceFile = symbol.filePath;

      // Group usages by file
      const usagesByFile = new Map<string, string[]>();
      for (const usage of symbol.usages) {
        if (usage.file !== sourceFile) {
          // External file is using this symbol
          const existingSymbols = usagesByFile.get(usage.file) || [];
          if (!existingSymbols.includes(symbol.name)) {
            existingSymbols.push(symbol.name);
          }
          usagesByFile.set(usage.file, existingSymbols);
        }
      }

      // Create import relationships (target file imports from source file)
      for (const [targetFile, symbolNames] of usagesByFile) {
        relationships.push({
          from: targetFile,
          to: sourceFile,
          kind: 'imports',
          symbols: symbolNames,
        });
      }
    }

    return relationships;
  }

  /**
   * Extract usage relationships from external references
   *
   * Identifies when a symbol uses types or symbols from other files/packages.
   *
   * @param symbols - Array of symbol metadata
   * @returns Array of file usage relationships
   */
  private extractUsages(symbols: SymbolMetadata[]): FileRelationship[] {
    const relationships: FileRelationship[] = [];

    for (const symbol of symbols) {
      if (!symbol.references || symbol.references.length === 0 || !symbol.filePath) {
        continue;
      }

      const sourceFile = symbol.filePath;

      // Group external references by module
      const referencesBySource = new Map<string, string[]>();
      for (const ref of symbol.references) {
        const existing = referencesBySource.get(ref.module) || [];
        if (!existing.includes(ref.name)) {
          existing.push(ref.name);
        }
        referencesBySource.set(ref.module, existing);
      }

      // Create usage relationships
      for (const [source, symbolNames] of referencesBySource) {
        relationships.push({
          from: sourceFile,
          to: source,
          kind: 'uses',
          symbols: symbolNames,
        });
      }
    }

    return relationships;
  }

  /**
   * Deduplicate relationships by combining those with same from/to/kind
   *
   * Merges symbol lists for relationships between the same files.
   *
   * @param relationships - Array of file relationships to deduplicate
   * @returns Deduplicated array of file relationships
   */
  private deduplicateRelationships(relationships: FileRelationship[]): FileRelationship[] {
    const key = (rel: FileRelationship) => `${rel.from}::${rel.to}::${rel.kind}`;
    const dedupMap = new Map<string, FileRelationship>();

    for (const rel of relationships) {
      const k = key(rel);
      const existing = dedupMap.get(k);

      if (existing) {
        // Merge symbols
        if (rel.symbols) {
          const mergedSymbols = new Set([...(existing.symbols || []), ...rel.symbols]);
          existing.symbols = Array.from(mergedSymbols).sort();
        }
      } else {
        // New relationship - clone to avoid mutations
        dedupMap.set(k, {
          ...rel,
          symbols: rel.symbols ? [...rel.symbols] : undefined,
        });
      }
    }

    return Array.from(dedupMap.values());
  }
}
