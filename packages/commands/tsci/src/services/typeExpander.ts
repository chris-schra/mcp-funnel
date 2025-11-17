import {
  ArrayType,
  IntrinsicType,
  LiteralType,
  ReflectionType,
  TupleType,
  Type,
  UnionType,
  UnknownType,
} from 'typedoc';
import { PrimitiveExpander } from './typeExpander/expanders/primitiveExpander.js';
import { ObjectExpander } from './typeExpander/expanders/objectExpander.js';
import { ArrayExpander } from './typeExpander/expanders/arrayExpander.js';
import { UnionExpander } from './typeExpander/expanders/unionExpander.js';
import {
  ExpansionContext,
  ExpansionResult,
  TypeExpanderConfig,
  TypeExpansionResult,
} from './typeExpander/types.js';
import { generateTypeId } from './typeExpander/utils.js';

/**
 * TypeExpander - Pure type expansion orchestrator with cycle detection.
 *
 * This service provides intelligent type expansion for TypeDoc Type objects,
 * orchestrating specialized expanders for different type kinds.
 *
 * Cherry-picked from POC: src/services/typeExpander.ts (lines 92-353)
 * Simplified: Only 4 expanders (primitive, object, array, union)
 *
 * Core responsibilities:
 * - Route types to appropriate specialized expanders
 * - Enforce cycle detection to prevent infinite recursion
 * - Apply configurable depth limits
 * - Maintain visited type tracking across expansion
 *
 * Architecture (SEAMS):
 * - TypeExpander: Pure orchestration (THIS CLASS)
 * - Specialized expanders: Handle specific type kinds (primitives, objects, arrays, unions)
 *
 * @example Basic usage
 * ```typescript
 * const expander = new TypeExpander({ maxDepth: 2 });
 * const result = expander.expand(type);
 * console.log(result.expanded); // "{ id: string; name: string }"
 * ```
 */
export class TypeExpander {
  private readonly config: Required<TypeExpanderConfig>;

  // Specialized expander instances (4 total - simplified)
  private readonly primitiveExpander: PrimitiveExpander;
  private readonly objectExpander: ObjectExpander;
  private readonly arrayExpander: ArrayExpander;
  private readonly unionExpander: UnionExpander;

  /**
   * Create a new TypeExpander with optional configuration
   *
   * @param config - Configuration options for expansion behavior
   */
  public constructor(config: TypeExpanderConfig = {}) {
    this.config = {
      maxDepth: config.maxDepth ?? 2,
      preferArraySyntax: config.preferArraySyntax ?? true,
    };

    // Initialize specialized expanders
    this.primitiveExpander = new PrimitiveExpander();
    this.objectExpander = new ObjectExpander({ maxDepth: this.config.maxDepth });
    this.arrayExpander = new ArrayExpander({ preferArraySyntax: this.config.preferArraySyntax });
    this.unionExpander = new UnionExpander();
  }

  /**
   * Expand a TypeDoc Type into a readable string representation.
   *
   * This is the main public API for type expansion. It initializes the
   * visited types tracking and delegates to expandInternal for the actual work.
   *
   * @param type - The TypeDoc Type to expand
   * @returns TypeExpansionResult with expanded string and metadata
   *
   * @example
   * ```typescript
   * const expander = new TypeExpander();
   * const result = expander.expand(someType);
   * if (result.truncated) {
   *   console.warn(`Expansion truncated: ${result.truncationReason}`);
   * }
   * console.log(result.expanded);
   * ```
   */
  public expand(type: Type): TypeExpansionResult {
    const visitedTypes = new Set<string>();
    return this.expandInternal(type, 0, visitedTypes);
  }

  /**
   * Adapter method to convert context-based expansion calls to depth-based calls.
   *
   * This bridge allows specialized expanders using ExpansionContext to delegate
   * back to this orchestrator for nested type expansion.
   *
   * @param type - Type to expand
   * @param context - Expansion context with depth and visited types
   * @returns Expansion result
   */
  private expandWithContext = (type: Type, context: ExpansionContext): ExpansionResult => {
    return this.expandInternal(type, context.depth, context.visitedTypes);
  };

  /**
   * Internal expansion method with cycle detection
   *
   * Cherry-picked from POC: lines 176-224
   *
   * @param type - Type to expand
   * @param depth - Current recursion depth
   * @param visitedTypes - Set of visited type IDs for cycle detection
   * @returns TypeExpansionResult with expanded string and metadata
   */
  private expandInternal(
    type: Type,
    depth: number,
    visitedTypes: Set<string>,
  ): TypeExpansionResult {
    // Check depth limit
    if (depth >= this.config.maxDepth) {
      return {
        expanded: type.toString(),
        truncated: true,
        truncationReason: 'depth',
      };
    }

    // Generate a unique identifier for this type at this context
    const typeId = generateTypeId(type, depth);

    // Check for cycles
    if (visitedTypes.has(typeId)) {
      return {
        expanded: '[Circular]',
        truncated: true,
        truncationReason: 'cycle',
      };
    }

    // Add to visited set
    visitedTypes.add(typeId);

    try {
      // Delegate to specific type handlers
      const result = this.expandByType(type, depth + 1, visitedTypes);

      // Remove from visited set after processing
      visitedTypes.delete(typeId);

      return result;
    } catch (_error) {
      // Remove from visited set on error
      visitedTypes.delete(typeId);

      // Fallback to toString on error
      return {
        expanded: type.toString(),
        truncated: true,
        truncationReason: 'depth',
      };
    }
  }

  /**
   * Route to specific type expansion based on TypeDoc type kind
   *
   * Cherry-picked from POC: lines 236-353
   * Simplified: Only 4 type kinds (primitive, array, union, reflection)
   *
   * @param type - Type to expand
   * @param depth - Current recursion depth
   * @param visitedTypes - Set of visited type IDs for cycle detection
   * @returns TypeExpansionResult with expanded string and metadata
   */
  private expandByType(type: Type, depth: number, visitedTypes: Set<string>): TypeExpansionResult {
    const context: ExpansionContext = { depth, visitedTypes };

    // Delegate to specialized expanders
    switch (type.type) {
      // Primitives (intrinsic, literal, unknown)
      case 'intrinsic':
      case 'literal':
      case 'unknown':
        return this.primitiveExpander.expand(
          type as IntrinsicType | LiteralType | UnknownType,
          context,
        );

      // Arrays and tuples
      case 'array':
      case 'tuple':
        return this.arrayExpander.expand(
          type as ArrayType | TupleType,
          context,
          this.expandWithContext,
        );

      // Union types
      case 'union':
        return this.unionExpander.expand(type as UnionType, context, this.expandWithContext);

      // Reflection types (objects)
      case 'reflection':
        return this.objectExpander.expandReflectionType(
          type as ReflectionType,
          context,
          this.expandWithContext,
        );

      default:
        // Fallback for any unhandled types (reference, intersection, conditional, etc.)
        // In simplified version, we just return toString()
        return {
          expanded: type.toString(),
          truncated: false,
        };
    }
  }
}

/**
 * Convenience function to expand a type with default configuration
 *
 * @param type - The TypeDoc Type to expand
 * @param config - Optional configuration for expansion behavior
 * @returns The expanded type as a string
 */
export function expandType(type: Type, config?: TypeExpanderConfig): string {
  const expander = new TypeExpander(config);
  return expander.expand(type).expanded;
}

/**
 * Convenience function to expand a type and get full result information
 *
 * @param type - The TypeDoc Type to expand
 * @param config - Optional configuration for expansion behavior
 * @returns Full TypeExpansionResult with metadata
 */
export function expandTypeWithResult(type: Type, config?: TypeExpanderConfig): TypeExpansionResult {
  const expander = new TypeExpander(config);
  return expander.expand(type);
}
