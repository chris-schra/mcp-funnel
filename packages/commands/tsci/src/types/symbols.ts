/**
 * Symbol metadata types for tsci command
 * Simplified from POC's CollectedSymbol and EnhancedSymbol types
 */

/**
 * Symbol usage tracking information
 */
export interface SymbolUsage {
  /** File where the symbol is used */
  file: string;
  /** Line numbers where usage occurs */
  lines: number[];
  /** Type of usage (import or actual usage) */
  kind: 'import' | 'usage';
}

/**
 * External reference information (e.g., types from other modules)
 */
export interface ExternalReference {
  /** Name of the referenced symbol */
  name: string;
  /** Kind of reference (type, class, interface, etc.) */
  kind: string;
  /** File where reference appears */
  from: string;
  /** Line number of reference */
  line: number;
  /** Module/package the reference comes from */
  module: string;
  /** Type preview with ⟶ notation (e.g., "⟶ \{ prop1: type1; ... \}") */
  preview?: string;
}

/**
 * Core symbol metadata collected from TypeDoc
 */
export interface SymbolMetadata {
  /** Stable unique identifier for the symbol */
  id: string;
  /** Display name of the symbol */
  name: string;
  /** TypeDoc ReflectionKind (numeric) */
  kind: number;
  /** Human-readable kind string */
  kindString?: string;
  /** Absolute path to the source file */
  filePath?: string;
  /** Line number where symbol is declared (1-based) */
  line?: number;
  /** Column/character position (1-based) */
  column?: number;
  /** Inline type signature (for quick display) */
  signature?: string;
  /** JSDoc summary text extracted from comments */
  summary?: string;
  /** Whether the symbol is exported */
  isExported: boolean;
  /** Usage locations (optional, for cross-reference analysis) */
  usages?: SymbolUsage[];
  /** External references (optional, for dependency analysis) */
  references?: ExternalReference[];
  /** Parent symbol ID (for hierarchical structure) */
  parentId?: string | null;
  /** Child symbol IDs (for hierarchical structure) */
  childrenIds?: string[];
}

/**
 * Filter criteria for querying symbols
 */
export interface SymbolFilter {
  /** Filter by file path (exact match or pattern) */
  filePath?: string;
  /** Filter by symbol kind(s) */
  kinds?: number[];
  /** Filter by name (exact match or pattern) */
  name?: string;
  /** Filter by export status */
  isExported?: boolean;
  /** Filter by parent ID */
  parentId?: string | null;
}
