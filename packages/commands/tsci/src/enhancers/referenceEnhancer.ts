/**
 * Reference enhancer for populating usages and references in SymbolMetadata
 * Ported from POC's ReferenceExtractor
 */

import * as ts from 'typescript';
import type { ISymbolEnhancer, EnhancementContext } from './ISymbolEnhancer.js';
import type { SymbolMetadata, SymbolUsage, ExternalReference } from '../types/index.js';
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
 * Populates usages (runtime usage) and references (type references) fields
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
   * Populate usages and references fields in SymbolMetadata
   * Classifies references into:
   * - usages: Runtime usages (function calls, property access)
   * - references: Type references from other files
   *
   * @param symbol - Symbol to populate
   * @param references - All references found
   */
  private populateReferences(symbol: SymbolMetadata, references: ReferenceInfo[]): void {
    // Group references by file for usages
    const usagesByFile = new Map<string, Set<number>>();
    const externalReferences: ExternalReference[] = [];

    for (const ref of references) {
      const { fileName, line, referenceType } = ref;

      // Determine if this is an actual usage or just a type reference
      const isActualUsage = referenceType === 'usage';
      const isTypeReference =
        referenceType === 'type-reference' ||
        referenceType === 'extends' ||
        referenceType === 'implements';

      // Populate usages (runtime usage + imports)
      if (isActualUsage || referenceType === 'import') {
        if (!usagesByFile.has(fileName)) {
          usagesByFile.set(fileName, new Set());
        }
        usagesByFile.get(fileName)!.add(line);

        // We'll consolidate these into SymbolUsage objects below
      }

      // Populate references (type references from other files only)
      if (isTypeReference && fileName !== symbol.filePath) {
        externalReferences.push({
          name: ref.text,
          kind: referenceType,
          from: fileName,
          line,
          module: this.getModuleFromPath(fileName),
        });
      }
    }

    // Convert usages map to SymbolUsage array
    const usages: SymbolUsage[] = [];
    for (const [file, lines] of usagesByFile) {
      // Determine kind: if all lines are imports, it's import; otherwise usage
      const allRefsInFile = references.filter((r) => r.fileName === file);
      const isImportOnly = allRefsInFile.every((r) => r.referenceType === 'import');

      usages.push({
        file,
        lines: Array.from(lines).sort((a, b) => a - b),
        kind: isImportOnly ? 'import' : 'usage',
      });
    }

    // Populate symbol fields (only if non-empty)
    if (usages.length > 0) {
      symbol.usages = usages;
    }
    if (externalReferences.length > 0) {
      symbol.references = externalReferences;
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
