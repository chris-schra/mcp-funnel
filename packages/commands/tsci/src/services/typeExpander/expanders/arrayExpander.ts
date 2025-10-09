import { ArrayType, TupleType, Type } from 'typedoc';
import { ExpansionContext, ExpansionResult } from '../types.js';
import { needsParentheses } from '../utils.js';

/**
 * Configuration options for ArrayExpander.
 */
export interface ArrayExpanderConfig {
  /**
   * Whether to prefer array syntax (T[] over Array<T>).
   */
  preferArraySyntax?: boolean;
}

/**
 * ArrayExpander handles expansion of array and tuple type representations.
 *
 * This expander is responsible for converting TypeDoc array and tuple types into
 * readable string representations, supporting various array syntaxes and tuple formats.
 *
 * Cherry-picked from POC: src/services/typeExpander/expanders/ArrayExpander.ts (lines 72-286)
 *
 * @remarks
 * Supported type formats:
 * - Standard arrays: `Array<T>` or `T[]`
 * - Tuples: `[Type1, Type2, Type3]`
 *
 * @example Basic array expansion
 * ```typescript
 * const expander = new ArrayExpander({ preferArraySyntax: true });
 * const arrayType = // ArrayType for string[]
 * const result = expander.expand(arrayType, context, expandFn);
 * // result.expanded === "string[]"
 * ```
 *
 * @example Tuple expansion
 * ```typescript
 * const expander = new ArrayExpander();
 * const tupleType = // TupleType for [string, number]
 * const result = expander.expand(tupleType, context, expandFn);
 * // result.expanded === "[string, number]"
 * ```
 *
 * @example Nested arrays
 * ```typescript
 * const expander = new ArrayExpander({ preferArraySyntax: true });
 * const nestedArrayType = // ArrayType for string[][]
 * const result = expander.expand(nestedArrayType, context, expandFn);
 * // result.expanded === "string[][]"
 * ```
 *
 * @example Array of unions with proper parentheses
 * ```typescript
 * const expander = new ArrayExpander();
 * const arrayType = // ArrayType for (string | number)[]
 * const result = expander.expand(arrayType, context, expandFn);
 * // result.expanded === "(string | number)[]"
 * ```
 */
export class ArrayExpander {
  private readonly config: Required<ArrayExpanderConfig>;

  /**
   * Creates a new ArrayExpander instance.
   *
   * @param config - Configuration options for array/tuple expansion
   */
  public constructor(config: ArrayExpanderConfig = {}) {
    this.config = {
      preferArraySyntax: config.preferArraySyntax ?? true,
    };
  }

  /**
   * Expands array and tuple types into their string representations.
   *
   * This method handles both ArrayType and TupleType, delegating to the appropriate
   * expansion method. It recursively expands element types using the provided
   * expansion function.
   *
   * @param type - The TypeDoc Type to expand (ArrayType or TupleType)
   * @param context - The current expansion context (depth, visited types, etc.)
   * @param expandFn - Function to recursively expand nested types
   * @returns ExpansionResult containing the expanded string and metadata
   *
   * @example
   * ```typescript
   * const result = expander.expand(
   *   arrayType,
   *   { depth: 0, visitedTypes: new Set() },
   *   (t, ctx) => ({ expanded: t.toString(), truncated: false })
   * );
   * ```
   */
  public expand(
    type: ArrayType | TupleType,
    context: ExpansionContext,
    expandFn: (type: Type, context: ExpansionContext) => ExpansionResult,
  ): ExpansionResult {
    // Route to specific expansion method based on type kind
    if (type.type === 'array') {
      return this.expandArrayType(type as ArrayType, context, expandFn);
    } else if (type.type === 'tuple') {
      return this.expandTupleType(type as TupleType, context, expandFn);
    }

    // Fallback for unsupported types (should not happen)
    return {
      expanded: (type as Type).toString(),
      truncated: false,
    };
  }

  /**
   * Expands array types with preference for T[] or Array<T> syntax.
   *
   * This method handles standard array types and chooses between T[] and Array<T>
   * syntax based on configuration. It automatically adds parentheses for complex
   * element types (e.g., unions, intersections) to maintain correct precedence.
   *
   * @param type - The ArrayType to expand
   * @param context - The current expansion context
   * @param expandFn - Function to recursively expand element types
   * @returns ExpansionResult with the expanded array type string
   *
   * @remarks
   * - Uses T[] syntax by default (configurable via preferArraySyntax)
   * - Automatically adds parentheses for complex element types (e.g., unions)
   * - Recursively expands element types
   *
   * @example Simple array
   * ```typescript
   * // Input: string[]
   * expandArrayType(stringArrayType, context, expandFn);
   * // Output: { expanded: "string[]", truncated: false }
   * ```
   *
   * @example Complex element type
   * ```typescript
   * // Input: (string | number)[]
   * expandArrayType(unionArrayType, context, expandFn);
   * // Output: { expanded: "(string | number)[]", truncated: false }
   * ```
   */
  private expandArrayType(
    type: ArrayType,
    context: ExpansionContext,
    expandFn: (type: Type, context: ExpansionContext) => ExpansionResult,
  ): ExpansionResult {
    const elementResult = expandFn(type.elementType, context);

    if (this.config.preferArraySyntax) {
      const needsParens = needsParentheses(type.elementType);
      const expanded = needsParens
        ? `(${elementResult.expanded})[]`
        : `${elementResult.expanded}[]`;

      return {
        expanded,
        truncated: elementResult.truncated,
        truncationReason: elementResult.truncationReason,
      };
    }

    return {
      expanded: `Array<${elementResult.expanded}>`,
      truncated: elementResult.truncated,
      truncationReason: elementResult.truncationReason,
    };
  }

  /**
   * Expands tuple types into their bracketed element list format.
   *
   * This method handles TypeScript tuple types, including:
   * - Standard tuples: `[Type1, Type2, Type3]`
   *
   * All element types are recursively expanded using the provided expansion function.
   *
   * @param type - The TupleType to expand
   * @param context - The current expansion context
   * @param expandFn - Function to recursively expand element types
   * @returns ExpansionResult with the expanded tuple type string
   *
   * @remarks
   * - Empty tuples are supported: `[]`
   *
   * @example Standard tuple
   * ```typescript
   * // Input: [string, number]
   * expandTupleType(standardTuple, context, expandFn);
   * // Output: { expanded: "[string, number]", truncated: false }
   * ```
   */
  private expandTupleType(
    type: TupleType,
    context: ExpansionContext,
    expandFn: (type: Type, context: ExpansionContext) => ExpansionResult,
  ): ExpansionResult {
    const expandedElements: string[] = [];
    let anyTruncated = false;
    let truncationReason: ExpansionResult['truncationReason'];

    for (const element of type.elements) {
      const result = expandFn(element, context);
      expandedElements.push(result.expanded);

      if (result.truncated) {
        anyTruncated = true;
        truncationReason = result.truncationReason;
      }
    }

    return {
      expanded: `[${expandedElements.join(', ')}]`,
      truncated: anyTruncated,
      truncationReason,
    };
  }
}
