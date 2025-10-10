/**
 * Type preview generator for external type references
 *
 * Generates concise previews of types for the ExternalReference.preview field.
 * Uses TypeScript compiler API to extract type information from declarations.
 *
 * Preview formats:
 * - Interfaces: \{ prop1: type1; prop2: type2; ... \}
 * - Classes: \{ prop1: type1; prop2: type2; constructor(...) \}
 * - Type Aliases: \{ prop1: type1; ... \} or raw type string
 * - Enums: \{ Value1 | Value2 | Value3 | ... \}
 *
 * @example
 * ```typescript
 * const generator = new TypePreviewGenerator();
 * const preview = generator.generatePreview(symbol, declaration);
 * // Result: "{ id: string; name: string; email: string }"
 * ```
 */

import * as ts from 'typescript';

/**
 * Generates type previews for external references
 */
export class TypePreviewGenerator {
  /**
   * Generate type preview for external references
   *
   * @param typeSymbol - Symbol of the referenced type
   * @param declaration - Declaration node of the type
   * @returns Preview string or undefined if preview cannot be generated
   */
  public generatePreview(typeSymbol: ts.Symbol, declaration: ts.Declaration): string | undefined {
    try {
      if (ts.isInterfaceDeclaration(declaration)) {
        return this.generateInterfacePreview(declaration);
      }
      if (ts.isClassDeclaration(declaration)) {
        return this.generateClassPreview(declaration);
      }
      if (ts.isTypeAliasDeclaration(declaration)) {
        return this.generateTypeAliasPreview(declaration);
      }
      if (ts.isEnumDeclaration(declaration)) {
        return this.generateEnumPreview(declaration);
      }
      return undefined;
    } catch (_error) {
      // Graceful degradation - don't fail the whole enhancement
      return undefined;
    }
  }

  /**
   * Normalize whitespace in type strings
   *
   * Removes newlines and excessive whitespace while preserving type syntax.
   * Converts multi-line formatted types to single-line compact representation.
   *
   * @param str - Type string to normalize
   * @returns Normalized type string with single spaces between tokens
   */
  private normalizeWhitespace(str: string): string {
    return str
      .replace(/\s+/g, ' ') // Replace all whitespace (including newlines) with single space
      .replace(/\s*([,;:])\s*/g, '$1 ') // Add space after commas, semicolons, colons
      .replace(/\s*([(){}[\]<>])\s*/g, '$1') // Remove all spaces around brackets/parens
      .replace(/([,;:])\s+([(){}[\]<>])/g, '$1$2') // Remove space between punctuation and brackets
      .replace(/=>/g, ' => ') // Ensure spaces around arrow operator
      .replace(/\s+/g, ' ') // Clean up any double spaces
      .trim();
  }

  /**
   * Generate preview for interface declarations
   *
   * @param declaration - Interface declaration node
   * @returns Interface preview string
   */
  private generateInterfacePreview(declaration: ts.InterfaceDeclaration): string | undefined {
    const members = declaration.members;
    if (members.length === 0) {
      return '{}';
    }

    const props: string[] = [];
    let count = 0;

    for (const member of members) {
      if (count >= 3) break;

      if (ts.isPropertySignature(member) && member.name) {
        const propName = member.name.getText();
        const optional = member.questionToken ? '?' : '';
        const readonly = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)
          ? 'readonly '
          : '';

        let typeStr = 'unknown';
        if (member.type) {
          typeStr = this.normalizeWhitespace(member.type.getText());
        }

        props.push(`${readonly}${propName}${optional}: ${typeStr}`);
        count++;
      }
    }

    if (props.length === 0) {
      return '{}';
    }

    const hasMore = members.length > 3;
    return `{ ${props.join('; ')}${hasMore ? '; ...' : ''} }`;
  }

  /**
   * Generate preview for class declarations
   *
   * @param declaration - Class declaration node
   * @returns Class preview string
   */
  private generateClassPreview(declaration: ts.ClassDeclaration): string | undefined {
    const parts: string[] = [];

    // Extract key properties (max 2)
    const properties = declaration.members.filter((m) => ts.isPropertyDeclaration(m));
    let propCount = 0;

    for (const prop of properties) {
      if (propCount >= 2) break;

      if (ts.isPropertyDeclaration(prop) && prop.name) {
        const propName = prop.name.getText();
        const optional = prop.questionToken ? '?' : '';

        let typeStr = 'unknown';
        if (prop.type) {
          typeStr = this.normalizeWhitespace(prop.type.getText());
        }

        parts.push(`${propName}${optional}: ${typeStr}`);
        propCount++;
      }
    }

    // Add constructor signature if available
    const constructors = declaration.members.filter((m) => ts.isConstructorDeclaration(m));
    if (constructors.length > 0) {
      const constructor = constructors[0] as ts.ConstructorDeclaration;
      const params = constructor.parameters
        .map((p) => {
          const paramName = p.name.getText();
          const paramType = p.type ? this.normalizeWhitespace(p.type.getText()) : 'unknown';
          return `${paramName}: ${paramType}`;
        })
        .join(', ');
      parts.push(`constructor(${params})`);
    }

    if (parts.length === 0) {
      return 'class';
    }

    return `{ ${parts.join('; ')} }`;
  }

  /**
   * Generate preview for type alias declarations
   *
   * @param declaration - Type alias declaration node
   * @returns Type alias preview string
   */
  private generateTypeAliasPreview(declaration: ts.TypeAliasDeclaration): string | undefined {
    if (!declaration.type) {
      return undefined;
    }

    // For object types, show property structure
    if (ts.isTypeLiteralNode(declaration.type)) {
      const members = declaration.type.members;
      if (members.length === 0) {
        return '{}';
      }

      const props: string[] = [];
      let count = 0;

      for (const member of members) {
        if (count >= 3) break;

        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText();
          const optional = member.questionToken ? '?' : '';

          let typeStr = 'unknown';
          if (member.type) {
            typeStr = this.normalizeWhitespace(member.type.getText());
          }

          props.push(`${propName}${optional}: ${typeStr}`);
          count++;
        }
      }

      const hasMore = members.length > 3;
      return `{ ${props.join('; ')}${hasMore ? '; ...' : ''} }`;
    }

    // For other types, use the type text directly
    return this.normalizeWhitespace(declaration.type.getText());
  }

  /**
   * Generate preview for enum declarations
   *
   * @param declaration - Enum declaration node
   * @returns Enum preview string
   */
  private generateEnumPreview(declaration: ts.EnumDeclaration): string | undefined {
    const members = declaration.members;
    if (members.length === 0) {
      return 'enum';
    }

    const values = members.slice(0, 3).map((m) => m.name.getText());
    const hasMore = members.length > 3;
    return `{ ${values.join(' | ')}${hasMore ? ' | ...' : ''} }`;
  }
}
