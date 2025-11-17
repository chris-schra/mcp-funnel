import { IntrinsicType, LiteralType, UnknownType } from 'typedoc';
import { ExpansionContext, ExpansionResult } from '../types.js';

/**
 * Primitive type expander for TypeScript primitive types.
 *
 * This class handles the expansion of primitive TypeScript types, which are
 * types that don't require recursive expansion. Primitive types are returned
 * as-is using their string representation.
 *
 * Cherry-picked from POC: src/services/typeExpander/expanders/PrimitiveExpander.ts (lines 53-181)
 *
 * ## Supported Primitive Types
 *
 * TypeDoc Type Categories:
 * - **Intrinsic types**: string, number, boolean, null, undefined, void, any,
 *   unknown, never, bigint, symbol, object
 * - **Literal types**: string literals ("foo"), number literals (42), boolean
 *   literals (true/false)
 * - **Unknown types**: TypeDoc's UnknownType for unresolved type references
 *
 * ## Design Philosophy
 *
 * Primitive types are the leaf nodes in the type expansion tree. They:
 * - Don't contain nested types that need expansion
 * - Don't have type parameters or complex structure
 * - Can be safely represented by their toString() output
 * - Never cause cycles or recursion issues
 *
 * @example Basic usage
 * ```typescript
 * const expander = new PrimitiveExpander();
 * const stringType = // ... TypeDoc IntrinsicType for 'string'
 * const context: ExpansionContext = {
 *   depth: 0,
 *   visitedTypes: new Set(),
 * };
 *
 * const result = expander.expand(stringType, context);
 * // result = { expanded: 'string', truncated: false }
 * ```
 *
 * @example Literal types
 * ```typescript
 * const expander = new PrimitiveExpander();
 * const literalType = // ... TypeDoc LiteralType for '"hello"'
 *
 * const result = expander.expand(literalType, context);
 * // result = { expanded: '"hello"', truncated: false }
 * ```
 */
export class PrimitiveExpander {
  /**
   * Set of primitive type names recognized by TypeScript.
   * Used for quick type name validation.
   */
  private static readonly PRIMITIVE_TYPE_NAMES = new Set([
    'string',
    'number',
    'boolean',
    'null',
    'undefined',
    'void',
    'never',
    'any',
    'unknown',
    'object',
    'bigint',
    'symbol',
  ]);

  /**
   * Checks if a type name string represents a primitive type.
   *
   * This is useful for filtering type references by name without needing
   * the full TypeDoc Type object.
   *
   * @param typeName - The name of the type to check
   * @returns true if the type name is a primitive type name
   *
   * @example
   * ```typescript
   * PrimitiveExpander.isPrimitiveTypeName('string');  // true
   * PrimitiveExpander.isPrimitiveTypeName('number');  // true
   * PrimitiveExpander.isPrimitiveTypeName('User');    // false
   * PrimitiveExpander.isPrimitiveTypeName('Array');   // false
   * ```
   */
  public static isPrimitiveTypeName(typeName: string): boolean {
    return PrimitiveExpander.PRIMITIVE_TYPE_NAMES.has(typeName);
  }

  /**
   * Expands a primitive type into its string representation.
   *
   * Since primitive types don't have nested structure, this method simply
   * returns the type's toString() representation. The expansion is never
   * truncated and doesn't depend on context (depth, visited types).
   *
   * @param type - The primitive TypeDoc Type to expand (must be IntrinsicType,
   *   LiteralType, or UnknownType)
   * @param _context - The expansion context (unused for primitives, but kept
   *   for interface consistency)
   * @returns ExpansionResult with the type's string representation and
   *   truncated: false
   *
   * @example Basic intrinsic types
   * ```typescript
   * const expander = new PrimitiveExpander();
   * const context: ExpansionContext = { depth: 0, visitedTypes: new Set() };
   *
   * // string type
   * const stringType = // ... IntrinsicType for 'string'
   * expander.expand(stringType, context);
   * // { expanded: 'string', truncated: false }
   *
   * // number type
   * const numberType = // ... IntrinsicType for 'number'
   * expander.expand(numberType, context);
   * // { expanded: 'number', truncated: false }
   * ```
   *
   * @example Literal types
   * ```typescript
   * // String literal
   * const stringLiteral = // ... LiteralType for '"hello"'
   * expander.expand(stringLiteral, context);
   * // { expanded: '"hello"', truncated: false }
   *
   * // Number literal
   * const numberLiteral = // ... LiteralType for '42'
   * expander.expand(numberLiteral, context);
   * // { expanded: '42', truncated: false }
   *
   * // Boolean literal
   * const boolLiteral = // ... LiteralType for 'true'
   * expander.expand(boolLiteral, context);
   * // { expanded: 'true', truncated: false }
   * ```
   */
  public expand(
    type: IntrinsicType | LiteralType | UnknownType,
    _context: ExpansionContext,
  ): ExpansionResult {
    return {
      expanded: type.toString(),
      truncated: false,
    };
  }
}
