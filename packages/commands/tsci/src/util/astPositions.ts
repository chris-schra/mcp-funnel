/**
 * Utilities for getting AST position information using TypeScript compiler API.
 *
 * TypeDoc doesn't expose end positions, so we parse the file ourselves to get
 * accurate line ranges for symbols.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';

/**
 * Cache of parsed source files to avoid re-parsing same file
 */
const sourceFileCache = new Map<string, ts.SourceFile>();

/**
 * Get a parsed TypeScript source file, using cache if available.
 *
 * @param filePath - Absolute path to file
 * @returns Parsed SourceFile
 */
function getSourceFile(filePath: string): ts.SourceFile {
  if (sourceFileCache.has(filePath)) {
    return sourceFileCache.get(filePath)!;
  }

  const content = readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
  );

  sourceFileCache.set(filePath, sourceFile);
  return sourceFile;
}

/**
 * Find the TypeScript AST node at a specific line and character position.
 *
 * Walks up from the matched node to find the nearest declaration-level node
 * (function, class, interface, etc.) to ensure we get the full symbol range.
 *
 * @param sourceFile - Parsed source file
 * @param line - 1-based line number
 * @param character - 0-based character offset within line
 * @returns TS declaration node at that position, or undefined
 */
function findNodeAtPosition(
  sourceFile: ts.SourceFile,
  line: number,
  character: number,
): ts.Node | undefined {
  // Convert 1-based line to 0-based for TS API
  const position = sourceFile.getPositionOfLineAndCharacter(line - 1, character);

  /**
   * Recursively visit nodes to find the node at target position
   *
   * @param node - TypeScript AST node to visit
   * @returns The node at the target position, or undefined
   */
  function visit(node: ts.Node): ts.Node | undefined {
    if (node.pos <= position && position < node.end) {
      // Check children first (more specific match)
      const child = ts.forEachChild(node, visit);
      return child || node;
    }
    return undefined;
  }

  let node = visit(sourceFile);
  if (!node) return undefined;

  // Walk up to find nearest declaration node
  // TypeDoc gives us the position of the identifier, but we want the full declaration
  while (node && !isDeclarationNode(node)) {
    node = node.parent;
  }

  return node;
}

/**
 * Check if a node is a declaration-level node that we want to report ranges for.
 *
 * @param node - TS AST node
 * @returns true if this is a declaration node
 */
function isDeclarationNode(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isVariableStatement(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isMethodSignature(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isModuleDeclaration(node)
  );
}

/**
 * Get the end line number for a symbol at a given start position.
 *
 * This parses the TypeScript AST to find the exact end position of the
 * declaration, including its full body (for functions/classes) or definition
 * (for interfaces/types).
 *
 * @param filePath - Absolute path to file
 * @param startLine - 1-based line number where symbol starts
 * @param startCharacter - 0-based character offset within line
 * @returns End line number (1-based)
 */
export function getSymbolEndLine(
  filePath: string,
  startLine: number,
  startCharacter: number,
): number {
  const sourceFile = getSourceFile(filePath);
  const node = findNodeAtPosition(sourceFile, startLine, startCharacter);

  if (!node) {
    // Fallback: return start line if we can't find node
    return startLine;
  }

  // Get line number of node's end position
  const endPos = sourceFile.getLineAndCharacterOfPosition(node.end);
  return endPos.line + 1; // Convert 0-based to 1-based
}

/**
 * Clear the source file cache.
 * Call this when done processing files to free memory.
 */
export function clearSourceFileCache(): void {
  sourceFileCache.clear();
}
