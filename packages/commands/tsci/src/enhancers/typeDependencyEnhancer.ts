/**
 * Type dependency enhancer for extracting external type references
 *
 * Extracts type dependencies (what types a symbol USES) rather than
 * usage references (where a symbol IS USED).
 *
 * For a class like:
 * ```typescript
 * import { ArrayExpander } from './ArrayExpander.js';
 * import { ExpansionContext } from './types.js';
 *
 * class TypeExpander {
 *   private expander: ArrayExpander;
 *   public expand(context: ExpansionContext): void { }
 * }
 * ```
 *
 * This enhancer extracts:
 * - ArrayExpander (from ./ArrayExpander.js)
 * - ExpansionContext (from ./types.js)
 *
 * NOT where TypeExpander is used elsewhere.
 */

import * as ts from 'typescript';
import type { ISymbolEnhancer, EnhancementContext } from './ISymbolEnhancer.js';
import type { SymbolMetadata, ExternalReference } from '../types/index.js';
import { TypePreviewGenerator } from './TypePreviewGenerator.js';

/**
 * Enhancer that extracts type dependencies from symbol declarations
 * Populates the `references` field with external types the symbol depends on
 */
export class TypeDependencyEnhancer implements ISymbolEnhancer {
  public readonly name = 'TypeDependencyEnhancer';
  private readonly previewGenerator = new TypePreviewGenerator();

  /**
   * Enhance symbols with type dependency information
   *
   * @param symbols - Symbols to enhance (modified in-place)
   * @param context - Enhancement context with TypeScript access
   */
  public async enhance(symbols: SymbolMetadata[], context: EnhancementContext): Promise<void> {
    const { program, checker } = context;

    for (const symbol of symbols) {
      // Skip symbols without location information
      if (!symbol.filePath || symbol.line === undefined) {
        continue;
      }

      // Get the declaration node for this symbol
      const declarationNode = this.findDeclarationNode(symbol, program);
      if (!declarationNode) {
        continue;
      }

      // Extract type dependencies from the declaration
      const dependencies = this.extractTypeDependencies(declarationNode, symbol.filePath, checker);

      // Populate references field (only if non-empty)
      if (dependencies.length > 0) {
        symbol.references = dependencies;
      }
    }
  }

  /**
   * Find the declaration node for a symbol using its file location
   *
   * @param metadata - Symbol metadata
   * @param program - TypeScript program
   * @returns Declaration node or undefined
   */
  private findDeclarationNode(metadata: SymbolMetadata, program: ts.Program): ts.Node | undefined {
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
    return this.findNodeAtPosition(sourceFile, position);
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

    const foundNode = find(sourceFile);

    // Walk up to find the containing declaration node
    return this.findContainingDeclaration(foundNode);
  }

  /**
   * Walk up the AST to find the containing declaration node
   *
   * For example, if we found an Identifier, walk up to find the ClassDeclaration,
   * InterfaceDeclaration, FunctionDeclaration, etc. that contains it.
   *
   * @param node - Starting node (might be an identifier or other specific node)
   * @returns Declaration node or the original node if no declaration found
   */
  private findContainingDeclaration(node: ts.Node | undefined): ts.Node | undefined {
    if (!node) {
      return undefined;
    }

    let current: ts.Node | undefined = node;

    while (current) {
      // Check if current node is a declaration we care about
      if (
        ts.isClassDeclaration(current) ||
        ts.isInterfaceDeclaration(current) ||
        ts.isFunctionDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isPropertyDeclaration(current) ||
        ts.isTypeAliasDeclaration(current) ||
        ts.isEnumDeclaration(current) ||
        ts.isVariableDeclaration(current)
      ) {
        return current;
      }

      // Walk up to parent
      current = current.parent;
    }

    // If no declaration found, return the original node
    return node;
  }

  /**
   * Extract type dependencies from a declaration node
   *
   * Walks the node's type annotations to find external type references.
   * Only includes references from other files (not same file as symbol).
   *
   * @param node - Declaration node to analyze
   * @param symbolFilePath - File path of the symbol being analyzed
   * @param checker - TypeScript type checker
   * @returns Array of external type references
   */
  private extractTypeDependencies(
    node: ts.Node,
    symbolFilePath: string,
    checker: ts.TypeChecker,
  ): ExternalReference[] {
    const dependencies = new Map<string, ExternalReference>();

    // Walk the node tree to find type references
    const visit = (n: ts.Node) => {
      // Check for type reference nodes
      if (ts.isTypeReferenceNode(n)) {
        this.processTypeReference(n, symbolFilePath, checker, dependencies);
      }

      // Recursively visit children
      ts.forEachChild(n, visit);
    };

    visit(node);

    return Array.from(dependencies.values());
  }

  /**
   * Process a type reference node and extract dependency information
   *
   * @param typeRef - Type reference node
   * @param symbolFilePath - File path of the symbol being analyzed
   * @param checker - TypeScript type checker
   * @param dependencies - Map to accumulate dependencies
   */
  private processTypeReference(
    typeRef: ts.TypeReferenceNode,
    symbolFilePath: string,
    checker: ts.TypeChecker,
    dependencies: Map<string, ExternalReference>,
  ): void {
    // Get the type name from the reference
    const typeName = this.getTypeName(typeRef);
    if (!typeName) {
      return;
    }

    // Get the symbol for this type reference
    let typeSymbol = checker.getSymbolAtLocation(typeRef.typeName);
    if (!typeSymbol) {
      return;
    }

    // Resolve alias symbols (imports) to get the actual symbol
    // When a type is imported, TypeScript creates an alias symbol
    // We need to follow the alias to find the actual declaration
    if (typeSymbol.flags & ts.SymbolFlags.Alias) {
      typeSymbol = checker.getAliasedSymbol(typeSymbol);
    }

    // Get the declaration for the symbol
    const declaration = typeSymbol.valueDeclaration || typeSymbol.declarations?.[0];
    if (!declaration) {
      return;
    }

    const sourceFile = declaration.getSourceFile();
    const declFilePath = sourceFile.fileName;

    // Skip if it's from the same file
    if (declFilePath === symbolFilePath) {
      return;
    }

    // Skip node_modules and .d.ts files (keep only project files)
    if (declFilePath.includes('node_modules') || declFilePath.endsWith('.d.ts')) {
      return;
    }

    // Get line number
    const { line } = sourceFile.getLineAndCharacterOfPosition(declaration.getStart());

    // Determine the kind of the referenced symbol
    const kind = this.getSymbolKind(typeSymbol);

    // Get the import module path
    const module = this.getModulePath(symbolFilePath, declFilePath);

    // Generate type preview
    const preview = this.previewGenerator.generatePreview(typeSymbol, declaration);

    // Create unique key to avoid duplicates
    const key = `${typeName}:${declFilePath}`;

    // Add to dependencies map
    if (!dependencies.has(key)) {
      dependencies.set(key, {
        name: typeName,
        kind,
        from: declFilePath,
        line: line + 1, // Convert to 1-based
        module,
        preview: preview ? `⟶ ${preview}` : undefined,
      });
    }
  }

  /**
   * Extract type name from a type reference node
   *
   * @param typeRef - Type reference node
   * @returns Type name or undefined
   */
  private getTypeName(typeRef: ts.TypeReferenceNode): string | undefined {
    const { typeName } = typeRef;

    if (ts.isIdentifier(typeName)) {
      return typeName.text;
    }

    if (ts.isQualifiedName(typeName)) {
      // For qualified names like "Module.Type", get the last part
      return typeName.right.text;
    }

    return undefined;
  }

  /**
   * Determine the kind of a symbol (class, interface, type, etc.)
   *
   * @param symbol - TypeScript symbol
   * @returns Kind string
   */
  private getSymbolKind(symbol: ts.Symbol): string {
    const flags = symbol.flags;

    if (flags & ts.SymbolFlags.Class) {
      return 'class';
    }
    if (flags & ts.SymbolFlags.Interface) {
      return 'interface';
    }
    if (flags & ts.SymbolFlags.TypeAlias) {
      return 'type';
    }
    if (flags & ts.SymbolFlags.Enum) {
      return 'enum';
    }
    if (flags & ts.SymbolFlags.Function) {
      return 'function';
    }

    // Default
    return 'type';
  }

  /**
   * Get the relative module path for an import
   *
   * @param fromFile - Source file path
   * @param toFile - Target file path
   * @returns Module import path
   */
  private getModulePath(fromFile: string, toFile: string): string {
    // Simple heuristic: extract relative path
    // In production, this should use proper module resolution

    const fromParts = fromFile.split('/');
    const toParts = toFile.split('/');

    // Find common prefix
    let commonLength = 0;
    const minLength = Math.min(fromParts.length, toParts.length);

    for (let i = 0; i < minLength - 1; i++) {
      if (fromParts[i] === toParts[i]) {
        commonLength++;
      } else {
        break;
      }
    }

    // Calculate relative path
    const upLevels = fromParts.length - commonLength - 1;
    const downPath = toParts.slice(commonLength);

    let relativePath = '';

    if (upLevels === 0) {
      relativePath = './';
    } else {
      relativePath = '../'.repeat(upLevels);
    }

    // Remove .ts/.tsx extension and add .js
    const fileName = downPath[downPath.length - 1].replace(/\.tsx?$/, '.js');
    downPath[downPath.length - 1] = fileName;

    relativePath += downPath.join('/');

    return relativePath;
  }
}
