import { DeclarationReflection, ReflectionType, Type } from 'typedoc';
import { ExpansionContext, ExpansionResult } from '../types.js';

/**
 * Configuration options for ObjectExpander
 */
export interface ObjectExpanderConfig {
  /**
   * Maximum depth for recursive expansion
   */
  maxDepth: number;
}

/**
 * ObjectExpander handles the expansion of object-like types in TypeDoc.
 *
 * This class is responsible for expanding:
 * - Object literal types (e.g., objects with properties)
 * - Interface types
 * - Type literals
 *
 * The expander recursively expands properties while respecting:
 * - Maximum depth limits to prevent infinite recursion
 * - Cycle detection to handle circular references
 *
 * Cherry-picked from POC: src/services/typeExpander/expanders/ObjectExpander.ts (lines 74-344)
 * Simplified: Basic object expansion only, no preview mode
 *
 * @example Basic usage
 * ```typescript
 * const expander = new ObjectExpander(\{ maxDepth: 2 \});
 * const context: ExpansionContext = \{
 *   depth: 0,
 *   visitedTypes: new Set(),
 * \};
 *
 * const result = expander.expandReflectionType(reflectionType, context, expandFn);
 * // Result: \{ name: string; age: number \}
 * ```
 *
 * @example With cycle detection
 * ```typescript
 * // Given circular reference: type Node = \{ value: string; next: Node \}
 * const result = expander.expandReflectionType(nodeType, context, expandFn);
 * // Result: \{ value: string; next: [Circular] \}
 * ```
 */
export class ObjectExpander {
  private readonly maxDepth: number;

  public constructor(config: ObjectExpanderConfig) {
    this.maxDepth = config.maxDepth;
  }

  /**
   * Expands a ReflectionType (object literal type) into its string representation.
   *
   * This method handles the expansion of object types that contain properties,
   * including nested objects, arrays, and other complex types.
   *
   * @param type - The ReflectionType to expand
   * @param context - The current expansion context with depth and visited types
   * @param expandProperty - Callback function to expand nested property types
   * @returns ExpansionResult with the expanded object type string
   *
   * @example
   * ```typescript
   * const context = { depth: 0, visitedTypes: new Set() };
   * const expandProp = (t, c) => ({ expanded: t.toString(), truncated: false });
   *
   * const result = expander.expandReflectionType(
   *   objectType,
   *   context,
   *   expandProp,
   * );
   * // Result: \{ prop1: string; prop2: number \}
   * ```
   */
  public expandReflectionType(
    type: ReflectionType,
    context: ExpansionContext,
    expandProperty: (type: Type, context: ExpansionContext) => ExpansionResult,
  ): ExpansionResult {
    // Check depth limit
    if (context.depth >= this.maxDepth) {
      return {
        expanded: '{ ... }',
        truncated: true,
        truncationReason: 'depth',
      };
    }

    // Generate unique identifier for cycle detection
    const typeId = this.generateTypeId(type, context);

    // Check for cycles
    if (context.visitedTypes.has(typeId)) {
      return {
        expanded: '[Circular]',
        truncated: true,
        truncationReason: 'cycle',
      };
    }

    // Add to visited set
    context.visitedTypes.add(typeId);

    try {
      // Expand the object structure
      const result = this.expandDeclaration(type.declaration, context, expandProperty);

      return result;
    } finally {
      // Always clean up visited set
      context.visitedTypes.delete(typeId);
    }
  }

  /**
   * Expands a DeclarationReflection into an object type string.
   *
   * This method processes the children (properties) of a declaration and
   * formats them as an object type literal.
   *
   * @param declaration - The declaration containing object properties
   * @param context - The current expansion context
   * @param expandProperty - Callback to expand nested property types
   * @returns ExpansionResult with formatted object string
   *
   * @example
   * ```typescript
   * // For interface Person { name: string; age: number; }
   * const result = expander.expandDeclaration(declaration, context, expand);
   * // Result: { name: string; age: number }
   * ```
   */
  private expandDeclaration(
    declaration: DeclarationReflection,
    context: ExpansionContext,
    expandProperty: (type: Type, context: ExpansionContext) => ExpansionResult,
  ): ExpansionResult {
    const children = declaration.children || [];

    // Handle empty objects
    if (children.length === 0) {
      return {
        expanded: '{}',
        truncated: false,
      };
    }

    // Expand each property
    const properties: string[] = [];
    let anyTruncated = false;
    let truncationReason: ExpansionResult['truncationReason'];

    for (const child of children) {
      const propertyResult = this.expandProperty(child, context, expandProperty);

      properties.push(propertyResult.expanded);

      if (propertyResult.truncated) {
        anyTruncated = true;
        truncationReason = propertyResult.truncationReason;
      }
    }

    // Format as object type
    const propertyList = properties.join('; ');
    const expanded = `{ ${propertyList} }`;

    return {
      expanded,
      truncated: anyTruncated,
      truncationReason,
    };
  }

  /**
   * Expands a single property of an object type.
   *
   * This method formats a property with its name, optional/readonly modifiers,
   * and expanded type.
   *
   * @param property - The property reflection to expand
   * @param context - The current expansion context
   * @param expandProperty - Callback to expand the property's type
   * @returns ExpansionResult with formatted property string
   *
   * @example
   * ```typescript
   * // For property: readonly name?: string
   * const result = expander.expandProperty(prop, context, expand);
   * // Result: readonly name?: string
   * ```
   */
  private expandProperty(
    property: DeclarationReflection,
    context: ExpansionContext,
    expandProperty: (type: Type, context: ExpansionContext) => ExpansionResult,
  ): ExpansionResult {
    const name = property.name;
    const optional = property.flags?.isOptional ? '?' : '';
    const readonly = property.flags?.isReadonly ? 'readonly ' : '';

    // Expand the property type
    if (!property.type) {
      return {
        expanded: `${readonly}${name}${optional}: unknown`,
        truncated: false,
      };
    }

    // Create new context for nested expansion
    const nestedContext: ExpansionContext = {
      ...context,
      depth: context.depth + 1,
    };

    const typeResult = expandProperty(property.type, nestedContext);

    return {
      expanded: `${readonly}${name}${optional}: ${typeResult.expanded}`,
      truncated: typeResult.truncated,
      truncationReason: typeResult.truncationReason,
    };
  }

  /**
   * Generates a unique identifier for a type to enable cycle detection.
   *
   * The identifier includes the type's declaration ID and current depth to
   * distinguish between different contexts of the same type.
   *
   * @param type - The ReflectionType to generate an ID for
   * @param context - The current expansion context
   * @returns A unique string identifier for cycle detection
   *
   * @example
   * ```typescript
   * const id = expander.generateTypeId(type, context);
   * // Result: "reflection:123:0" (type: declaration id: depth)
   * ```
   */
  private generateTypeId(type: ReflectionType, context: ExpansionContext): string {
    // Use the declaration's ID for uniqueness
    const declarationId = type.declaration.id;
    return `reflection:${declarationId}:${context.depth}`;
  }

  /**
   * Returns the maximum depth configuration for this expander.
   *
   * @returns The maximum recursion depth allowed
   */
  public getMaxDepth(): number {
    return this.maxDepth;
  }
}
