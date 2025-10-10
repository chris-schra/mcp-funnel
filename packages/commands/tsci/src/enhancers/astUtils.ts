/**
 * AST utility functions for reference classification
 * Extracted from ReferenceEnhancer to reduce file size
 */

import * as ts from 'typescript';

/**
 * Classification of reference types
 */
export type ReferenceType =
  | 'import'
  | 'export'
  | 'usage'
  | 'type-reference'
  | 'extends'
  | 'implements';

/**
 * Check if a node is part of a declaration (not a usage)
 *
 * @param node - Node to check
 * @returns True if node is part of declaration
 */
// eslint-disable-next-line complexity
export function isPartOfDeclaration(node: ts.Node): boolean {
  const parent = node.parent;

  if (!parent) {
    return false;
  }

  // Function declaration name
  if (ts.isFunctionDeclaration(parent) && parent.name === node) {
    return true;
  }
  // Variable declaration name
  if (ts.isVariableDeclaration(parent) && parent.name === node) {
    return true;
  }
  // Class declaration name
  if (ts.isClassDeclaration(parent) && parent.name === node) {
    return true;
  }
  // Interface declaration name
  if (ts.isInterfaceDeclaration(parent) && parent.name === node) {
    return true;
  }
  // Property declaration name
  if (ts.isPropertyDeclaration(parent) && parent.name === node) {
    return true;
  }
  // Method declaration name
  if (ts.isMethodDeclaration(parent) && parent.name === node) {
    return true;
  }
  // Property signature name
  if (ts.isPropertySignature(parent) && parent.name === node) {
    return true;
  }
  // Type alias name
  if (ts.isTypeAliasDeclaration(parent) && parent.name === node) {
    return true;
  }
  // Enum declaration name
  if (ts.isEnumDeclaration(parent) && parent.name === node) {
    return true;
  }

  return false;
}

/**
 * Determine the type of reference
 *
 * @param node - Node to classify
 * @returns Reference type classification
 */
// eslint-disable-next-line complexity
export function getReferenceType(node: ts.Node): ReferenceType {
  let parent = node.parent;

  // Check the immediate parent context for heritage clauses
  // (TypeReferenceNode -> ExpressionWithTypeArguments -> HeritageClause)
  if (ts.isIdentifier(node) && parent) {
    if (ts.isTypeReferenceNode(parent) && parent.parent) {
      if (ts.isExpressionWithTypeArguments(parent.parent) && parent.parent.parent) {
        if (ts.isHeritageClause(parent.parent.parent)) {
          const clause = parent.parent.parent;
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            return 'extends';
          }
          if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
            return 'implements';
          }
        }
      }
    }
  }

  // Walk up the parent chain to find the meaningful context
  while (parent) {
    // Check for import statements
    if (ts.isImportSpecifier(parent) || ts.isImportClause(parent)) {
      return 'import';
    }

    // Check for export statements (re-exports)
    if (ts.isExportSpecifier(parent) || ts.isExportDeclaration(parent)) {
      return 'export';
    }

    // Check for extends clause (backup check)
    if (ts.isHeritageClause(parent)) {
      if (parent.token === ts.SyntaxKind.ExtendsKeyword) {
        return 'extends';
      }
      if (parent.token === ts.SyntaxKind.ImplementsKeyword) {
        return 'implements';
      }
    }

    // Check for type references (e.g., variable declarations, parameters, return types)
    // But don't match TypeReferenceNode if it's part of a heritage clause (implements/extends)
    if (
      (ts.isTypeReferenceNode(parent) && !ts.isHeritageClause(parent.parent)) ||
      (ts.isTypeNode(parent) && !ts.isTypeReferenceNode(parent)) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent)
    ) {
      return 'type-reference';
    }

    // Check if we've gone too far up
    if (ts.isSourceFile(parent) || ts.isBlock(parent) || ts.isFunctionDeclaration(parent)) {
      break;
    }

    parent = parent.parent;
  }

  // Default to usage for actual runtime usage (function calls, property access, etc.)
  return 'usage';
}

/**
 * Check if a node represents write access
 *
 * @param node - Node to check
 * @returns True if this is a write access
 */
export function isWriteAccess(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // Check if this is the left side of an assignment
  if (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    return true;
  }

  // Check if this is a property assignment
  if (ts.isPropertyAssignment(parent) && parent.name === node) {
    return false; // Property name in object literal is not a write
  }

  // Check for increment/decrement
  if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) {
    const op = parent.operator;
    return op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken;
  }

  return false;
}
