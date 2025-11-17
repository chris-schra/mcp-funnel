/**
 * Configuration options for TypeExpander
 */
export interface TypeExpanderConfig {
  /**
   * Maximum depth to expand types (default: 2)
   */
  maxDepth?: number;

  /**
   * Whether to prefer array syntax (T[] over Array<T>)
   */
  preferArraySyntax?: boolean;
}

/**
 * Result of type expansion
 */
export interface TypeExpansionResult {
  /**
   * The expanded type string
   */
  expanded: string;

  /**
   * Whether expansion was truncated due to cycles or depth
   */
  truncated: boolean;

  /**
   * Reason for truncation if applicable
   */
  truncationReason?: 'cycle' | 'depth';
}

/**
 * Context information provided during type expansion.
 *
 * The expansion context tracks the current state of type expansion, including
 * the recursion depth and previously visited types to prevent infinite loops.
 */
export interface ExpansionContext {
  /**
   * Current recursion depth in the type expansion tree.
   * Starts at 0 for the root type and increments for each nested type.
   */
  depth: number;

  /**
   * Set of type identifiers that have been visited during expansion.
   * Used for cycle detection to prevent infinite recursion.
   */
  visitedTypes: Set<string>;
}

/**
 * Result of a type expansion operation.
 *
 * Contains the expanded type string and metadata about the expansion process,
 * including whether truncation occurred and the reason for it.
 */
export interface ExpansionResult {
  /**
   * The expanded type representation as a string.
   */
  expanded: string;

  /**
   * Whether the expansion was truncated due to depth limits or cycles.
   */
  truncated: boolean;

  /**
   * The reason for truncation, if applicable.
   */
  truncationReason?: 'cycle' | 'depth';
}
