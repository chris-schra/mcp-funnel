/**
 * In-memory symbol index for fast lookups
 * Provides efficient querying of collected symbols
 */

import type { SymbolMetadata, SymbolFilter } from '../types/index.js';

/**
 * In-memory index for fast symbol lookups
 */
export class SymbolIndex {
  private symbolsById: Map<string, SymbolMetadata> = new Map();
  private symbolsByFile: Map<string, SymbolMetadata[]> = new Map();
  private symbolsByKind: Map<number, SymbolMetadata[]> = new Map();
  private symbolsByName: Map<string, SymbolMetadata[]> = new Map();

  /**
   * Add a single symbol to the index
   *
   * @param symbol - Symbol metadata to add
   * @returns void
   */
  public add(symbol: SymbolMetadata): void {
    // Index by ID (primary key)
    this.symbolsById.set(symbol.id, symbol);

    // Index by file path
    if (symbol.filePath) {
      if (!this.symbolsByFile.has(symbol.filePath)) {
        this.symbolsByFile.set(symbol.filePath, []);
      }
      this.symbolsByFile.get(symbol.filePath)!.push(symbol);
    }

    // Index by kind
    if (!this.symbolsByKind.has(symbol.kind)) {
      this.symbolsByKind.set(symbol.kind, []);
    }
    this.symbolsByKind.get(symbol.kind)!.push(symbol);

    // Index by name
    if (!this.symbolsByName.has(symbol.name)) {
      this.symbolsByName.set(symbol.name, []);
    }
    this.symbolsByName.get(symbol.name)!.push(symbol);
  }

  /**
   * Add multiple symbols to the index
   *
   * @param symbols - Array of symbol metadata to add
   * @returns void
   */
  public addMany(symbols: SymbolMetadata[]): void {
    for (const symbol of symbols) {
      this.add(symbol);
    }
  }

  /**
   * Get a symbol by its unique ID
   *
   * @param id - Symbol identifier
   * @returns Symbol metadata or undefined if not found
   */
  public getById(id: string): SymbolMetadata | undefined {
    return this.symbolsById.get(id);
  }

  /**
   * Get all symbols in a specific file
   *
   * @param file - File path
   * @returns Array of symbols in the file
   */
  public getByFile(file: string): SymbolMetadata[] {
    return this.symbolsByFile.get(file) || [];
  }

  /**
   * Get all symbols of a specific kind
   *
   * @param kind - Reflection kind number
   * @returns Array of symbols of the specified kind
   */
  public getByKind(kind: number): SymbolMetadata[] {
    return this.symbolsByKind.get(kind) || [];
  }

  /**
   * Get all symbols with a specific name
   *
   * @param name - Symbol name
   * @returns Array of symbols with the specified name
   */
  public getByName(name: string): SymbolMetadata[] {
    return this.symbolsByName.get(name) || [];
  }

  /**
   * Query symbols using filter criteria
   *
   * @param filter - Filter criteria to apply
   * @returns Array of symbols matching the filter
   */
  public query(filter: SymbolFilter): SymbolMetadata[] {
    let results: SymbolMetadata[] = Array.from(this.symbolsById.values());

    // Filter by file path
    if (filter.filePath !== undefined) {
      results = results.filter((symbol) => symbol.filePath === filter.filePath);
    }

    // Filter by kinds
    if (filter.kinds !== undefined && filter.kinds.length > 0) {
      results = results.filter((symbol) => filter.kinds!.includes(symbol.kind));
    }

    // Filter by name
    if (filter.name !== undefined) {
      results = results.filter((symbol) => symbol.name === filter.name);
    }

    // Filter by export status
    if (filter.isExported !== undefined) {
      results = results.filter((symbol) => symbol.isExported === filter.isExported);
    }

    // Filter by parent ID
    if (filter.parentId !== undefined) {
      results = results.filter((symbol) => symbol.parentId === filter.parentId);
    }

    return results;
  }

  /**
   * Get all symbols in the index
   *
   * @returns Array of all symbol metadata
   */
  public getAll(): SymbolMetadata[] {
    return Array.from(this.symbolsById.values());
  }

  /**
   * Get the total number of symbols in the index
   *
   * @returns Number of symbols
   */
  public size(): number {
    return this.symbolsById.size;
  }

  /**
   * Clear all symbols from the index
   *
   * @returns void
   */
  public clear(): void {
    this.symbolsById.clear();
    this.symbolsByFile.clear();
    this.symbolsByKind.clear();
    this.symbolsByName.clear();
  }
}
