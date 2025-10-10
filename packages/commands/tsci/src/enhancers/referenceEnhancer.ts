/**
 * Reference enhancer for populating usages and references in SymbolMetadata
 * Ported from POC's ReferenceExtractor
 */

import * as ts from 'typescript';
import type { ISymbolEnhancer, EnhancementContext } from './ISymbolEnhancer.js';
import type { SymbolMetadata, SymbolUsage } from '../types/index.js';
import {
  getReferenceType,
  isPartOfDeclaration,
  isWriteAccess,
  type ReferenceType,
} from './astUtils.js';

/**
 * Internal reference info structure (matches PoC format)
 */
interface ReferenceInfo {
  fileName: string;
  line: number;
  column: number;
  text: string;
  isWrite: boolean;
  isImport: boolean;
  referenceType: ReferenceType;
}

/**
 * Enhancer that finds and classifies all references to symbols
 * Populates usages (runtime usage) field
 *
 * Note: Type dependencies are handled by TypeDependencyEnhancer
 */
export class ReferenceEnhancer implements ISymbolEnhancer {
  public readonly name = 'ReferenceEnhancer';

  /**
   * Enhance symbols with reference information
   *
   * @param symbols - Symbols to enhance (modified in-place)
   * @param context - Enhancement context with TypeScript access
   */
  public async enhance(symbols: SymbolMetadata[], context: EnhancementContext): Promise<void> {
    const { program, checker } = context;

    // Process each symbol
    for (const symbol of symbols) {
      // Skip symbols without location information
      if (!symbol.filePath || symbol.line === undefined) {
        continue;
      }

      // Get the TypeScript symbol for this metadata
      const tsSymbol = this.getTsSymbol(symbol, program, checker);
      if (!tsSymbol) {
        continue;
      }

      // Find all references to this symbol
      const references = this.findReferences(program, tsSymbol, checker);

      // Classify and populate usages and references
      this.populateReferences(symbol, references);
    }
  }

  /**
   * Get TypeScript symbol from SymbolMetadata
   * Maps back from metadata to ts.Symbol using file location
   *
   * @param metadata - Symbol metadata
   * @param program - TypeScript program
   * @param checker - TypeScript type checker
   * @returns TypeScript symbol or undefined if not found
   */
  private getTsSymbol(
    metadata: SymbolMetadata,
    program: ts.Program,
    checker: ts.TypeChecker,
  ): ts.Symbol | undefined {
    if (!metadata.filePath || metadata.line === undefined) {
      return undefined;
    }

    const sourceFile = program.getSourceFile(metadata.filePath);
    if (!sourceFile) {
      return undefined;
    }

    // Convert 1-based line to 0-based and get position
    const position = sourceFile.getPositionOfLineAndCharacter(
      metadata.line - 1,
      metadata.column || 0,
    );

    // Find the node at this position
    const node = this.findNodeAtPosition(sourceFile, position);
    if (!node) {
      return undefined;
    }

    // Get symbol from node
    return checker.getSymbolAtLocation(node);
  }

  /**
   * Find the most specific node at a given position
   *
   * @param sourceFile - Source file to search
   * @param position - Position in file
   * @returns Node at position or undefined
   */
  private findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
    /**
     * Recursively search for the node at the given position
     *
     * @param node - Current node to check
     * @returns Most specific node at position or undefined
     */
    function find(node: ts.Node): ts.Node | undefined {
      if (position >= node.getStart() && position < node.getEnd()) {
        return ts.forEachChild(node, find) || node;
      }
      return undefined;
    }

    return find(sourceFile);
  }

  /**
   * Find all references to a symbol across the program
   * Ported from PoC's findReferences method
   *
   * @param program - TypeScript program
   * @param symbol - Symbol to find references for
   * @param checker - Type checker
   * @returns Array of reference information
   */
  private findReferences(
    program: ts.Program,
    symbol: ts.Symbol,
    checker: ts.TypeChecker,
  ): ReferenceInfo[] {
    const references: ReferenceInfo[] = [];

    // Get the declaration position to filter it out
    const declarationPos =
      symbol.valueDeclaration?.getStart() || symbol.declarations?.[0]?.getStart();

    // Get all source files in the program
    const sourceFiles = program.getSourceFiles();

    for (const file of sourceFiles) {
      // Skip node_modules and .d.ts files
      if (file.fileName.includes('node_modules') || file.fileName.endsWith('.d.ts')) {
        continue;
      }

      // Find all identifiers in the file
      this.findReferencesInFile(file, symbol, checker, references, declarationPos);
    }

    return references;
  }

  /**
   * Find references in a single source file
   * Ported from PoC's findReferencesInFile method
   *
   * @param sourceFile - Source file to search
   * @param targetSymbol - Symbol to find references for
   * @param checker - Type checker
   * @param references - Array to accumulate results
   * @param declarationPos - Position of declaration to skip
   */
  private findReferencesInFile(
    sourceFile: ts.SourceFile,
    targetSymbol: ts.Symbol,
    checker: ts.TypeChecker,
    references: ReferenceInfo[],
    declarationPos?: number,
  ): void {
    const visit = (node: ts.Node) => {
      // Check if this node references our target symbol
      if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
        const nodeSymbol = checker.getSymbolAtLocation(node);

        // Check if this symbol matches our target
        if (nodeSymbol && this.symbolsMatch(nodeSymbol, targetSymbol, checker)) {
          // Skip if this is the declaration itself
          if (declarationPos !== undefined && node.getStart() === declarationPos) {
            return;
          }

          // Also skip if this is part of the declaration
          if (isPartOfDeclaration(node)) {
            return;
          }

          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());

          // Determine if this is a write operation
          const isWrite = isWriteAccess(node);

          // Determine the type of reference
          const referenceType = getReferenceType(node);
          const isImport = referenceType === 'import' || referenceType === 'export';

          references.push({
            fileName: sourceFile.fileName,
            line: line + 1, // Convert to 1-based
            column: character,
            text: node.getText(sourceFile),
            isWrite,
            isImport,
            referenceType,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /**
   * Check if two symbols match (including alias resolution)
   * Ported from PoC's symbolsMatch method
   *
   * @param symbol1 - First symbol
   * @param symbol2 - Second symbol
   * @param checker - Type checker
   * @returns True if symbols match
   */
  private symbolsMatch(symbol1: ts.Symbol, symbol2: ts.Symbol, checker: ts.TypeChecker): boolean {
    // Direct match
    if (symbol1 === symbol2) return true;

    // Check if one is an alias of the other
    if (symbol1.flags & ts.SymbolFlags.Alias) {
      const aliased = checker.getAliasedSymbol(symbol1);
      if (aliased === symbol2) return true;
    }
    if (symbol2.flags & ts.SymbolFlags.Alias) {
      const aliased = checker.getAliasedSymbol(symbol2);
      if (aliased === symbol1) return true;
    }

    // Check if they refer to the same declaration
    const decl1 = symbol1.valueDeclaration || symbol1.declarations?.[0];
    const decl2 = symbol2.valueDeclaration || symbol2.declarations?.[0];
    if (decl1 && decl2 && decl1 === decl2) return true;

    return false;
  }

  /**
   * Populate usages field in SymbolMetadata
   * Tracks where the symbol is used (runtime usage and imports)
   *
   * Note: Type dependencies (what types the symbol USES) are handled by
   * TypeDependencyEnhancer, which populates the `references` field.
   *
   * Imports and actual usages from the same file are stored as separate entries.
   *
   * @param symbol - Symbol to populate
   * @param references - All references found
   */
  private populateReferences(symbol: SymbolMetadata, references: ReferenceInfo[]): void {
    // Separate maps for imports and actual usages (matching PoC behavior)
    const importsByFile = new Map<string, Set<number>>();
    const usagesByFile = new Map<string, Set<number>>();

    for (const ref of references) {
      const { fileName, line, referenceType } = ref;

      // Classify reference type
      const isImport = referenceType === 'import' || referenceType === 'export';
      // FIX: Include type-reference, extends, and implements as actual usages
      // These are all legitimate uses of the symbol, not just imports
      const isActualUsage =
        referenceType === 'usage' ||
        referenceType === 'type-reference' ||
        referenceType === 'extends' ||
        referenceType === 'implements';

      // Group imports separately
      if (isImport) {
        if (!importsByFile.has(fileName)) {
          importsByFile.set(fileName, new Set());
        }
        importsByFile.get(fileName)!.add(line);
      }

      // Group actual usages separately
      if (isActualUsage) {
        if (!usagesByFile.has(fileName)) {
          usagesByFile.set(fileName, new Set());
        }
        usagesByFile.get(fileName)!.add(line);
      }
    }

    // Convert maps to SymbolUsage array
    const usages: SymbolUsage[] = [];

    // Add import entries
    for (const [file, lines] of importsByFile) {
      usages.push({
        file,
        lines: Array.from(lines).sort((a, b) => a - b),
        kind: 'import',
      });
    }

    // Add actual usage entries
    for (const [file, lines] of usagesByFile) {
      usages.push({
        file,
        lines: Array.from(lines).sort((a, b) => a - b),
        kind: 'usage',
      });
    }

    // Populate symbol usages field (only if non-empty)
    if (usages.length > 0) {
      symbol.usages = usages;
    }
  }

  /**
   * Extract module name from file path
   * Simple heuristic: last directory name or filename without extension
   *
   * @param filePath - File path
   * @returns Module name
   */
  private getModuleFromPath(filePath: string): string {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(ts|tsx|js|jsx)$/, '');
  }
}
