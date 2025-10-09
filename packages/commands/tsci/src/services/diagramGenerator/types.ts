/**
 * Diagram generation types for visualizing code structure
 *
 * Provides Mermaid diagram generation for file relationships and symbol dependencies.
 * SEAM: Format interface allows alternative diagram formats (GraphViz, etc.) in future.
 */

/**
 * Diagram format type
 * SEAM: Currently only mermaid, but interface allows future formats
 */
export type DiagramFormat = 'mermaid';

/**
 * Options for controlling diagram generation
 */
export interface DiagramOptions {
  /**
   * Diagram format (default: 'mermaid')
   * SEAM: Can add 'graphviz', 'dot', etc. in phase 2
   */
  format?: DiagramFormat;

  /**
   * Highlight a specific file or symbol in the diagram
   * When set, the diagram will emphasize this node and its direct relationships
   */
  focus?: string;

  /**
   * Maximum relationship depth to include (default: 1)
   * Limits the diagram size by showing only N levels of dependencies
   */
  maxDepth?: number;

  /**
   * Maximum number of nodes to include (default: 20)
   * Prevents overwhelming diagrams by capping total node count
   */
  maxNodes?: number;
}

/**
 * Types of file relationships
 * - imports: File A imports from file B
 * - uses: File A uses symbols from file B
 */
export type FileRelationshipKind = 'imports' | 'uses';

/**
 * Relationship between two files
 */
export interface FileRelationship {
  /**
   * Source file path
   */
  from: string;

  /**
   * Target file path
   */
  to: string;

  /**
   * Type of relationship
   */
  kind: FileRelationshipKind;

  /**
   * Specific symbols involved in the relationship
   * e.g., ['SymbolMetadata', 'FormatOptions'] for imports
   */
  symbols?: string[];
}

/**
 * Types of symbol relationships
 * - calls: Function A calls function B
 * - extends: Class A extends class B
 * - implements: Class A implements interface B
 * - uses: Symbol A uses type B in its signature
 */
export type SymbolRelationshipKind = 'calls' | 'extends' | 'implements' | 'uses';

/**
 * Relationship between two symbols
 * SEAM: Currently unused (MVP focuses on file-level), ready for phase 2
 */
export interface SymbolRelationship {
  /**
   * Source symbol ID
   */
  from: string;

  /**
   * Target symbol ID
   */
  to: string;

  /**
   * Type of relationship
   */
  kind: SymbolRelationshipKind;
}

/**
 * Dependency graph structure
 */
export interface DependencyGraph {
  /**
   * All files in the graph
   */
  files: string[];

  /**
   * Relationships between files
   */
  fileRelationships: FileRelationship[];

  /**
   * Relationships between symbols (optional, for detailed diagrams)
   * SEAM: Ready for phase 2 symbol-level diagrams
   */
  symbolRelationships?: SymbolRelationship[];
}

/**
 * SEAM: Interface for diagram renderers
 * Allows custom rendering strategies for different formats
 */
export interface IDiagramRenderer {
  /**
   * Render a dependency graph as a diagram string
   */
  render(graph: DependencyGraph, options: DiagramOptions): string;
}

/**
 * SEAM: Interface for graph builders
 * Allows custom graph construction strategies
 */
export interface IGraphBuilder {
  /**
   * Build a dependency graph from symbol metadata
   */
  buildGraph(symbols: unknown[]): DependencyGraph;
}
