import { Type, TypeContext } from 'typedoc';

/**
 * Generate a unique identifier for a type in a specific context
 *
 * This function creates a string identifier that can be used for cycle detection
 * and type caching. For reference types, it includes the type name and structure
 * of type arguments. For other types, it uses the type kind and string representation.
 *
 * Cherry-picked from POC: src/services/typeExpander/utils/typeUtils.ts (lines 89-100)
 *
 * @param type - The TypeDoc Type to generate an ID for
 * @param _depth - Current recursion depth (unused in simplified version)
 * @returns A unique identifier string for the type
 *
 * @example
 * ```typescript
 * // For reference types
 * generateTypeId(arrayUserType, 0);
 * // Returns: "reference:Array:User"
 *
 * // For other types
 * generateTypeId(stringType, 0);
 * // Returns: "intrinsic:string"
 * ```
 */
export function generateTypeId(type: Type, _depth: number): string {
  // For reference types, use name and type args structure to detect cycles
  if (type.type === 'reference') {
    const refType = type as { name?: string; typeArguments?: Type[] };
    const argTypes = refType.typeArguments?.map((arg: Type) => arg.type).join(',') || '';
    return `reference:${refType.name || 'unknown'}:${argTypes}`;
  }

  // For other types, use type kind and basic structure
  return `${type.type}:${type.toString()}`;
}

/**
 * Determines if a type needs parentheses when used in certain contexts.
 *
 * This method checks if a type requires parentheses in specific contexts like
 * array element position to maintain correct precedence.
 *
 * @param type - The type to check
 * @returns true if parentheses are needed around this type
 *
 * @remarks
 * Examples:
 * - `string | number` in array context needs parens: `(string | number)[]`
 * - `string` in array context doesn't need parens: `string[]`
 * - `A & B` in array context needs parens: `(A & B)[]`
 *
 * @example
 * ```typescript
 * needsParentheses(stringType);      // false → string[]
 * needsParentheses(unionType);       // true → (A | B)[]
 * needsParentheses(intersectionType); // true → (A & B)[]
 * ```
 */
export function needsParentheses(type: Type): boolean {
  try {
    return type.needsParenthesis(TypeContext.arrayElement);
  } catch {
    // Fallback for test mocks or types without needsParenthesis method
    const typeWithMethod = type as { needsParenthesis?: (context: TypeContext) => boolean };
    return typeWithMethod.needsParenthesis?.(TypeContext.arrayElement) ?? false;
  }
}
