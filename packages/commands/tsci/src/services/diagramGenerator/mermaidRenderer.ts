/**
 * Mermaid diagram renderer for dependency graphs
 *
 * Converts dependency graphs into Mermaid syntax for visualization.
 * Supports focus highlighting and node limiting to keep diagrams readable.
 */

import path from 'node:path';
import type {
  DependencyGraph,
  DiagramOptions,
  FileRelationship,
  IDiagramRenderer,
} from './types.js';

/**
 * Renders dependency graphs as Mermaid diagrams
 *
 * Generates token-efficient Mermaid syntax with:
 * - Readable node labels (basenames)
 * - Focus highlighting
 * - Node count limits
 * - Depth limits for relationships
 */
export class MermaidRenderer implements IDiagramRenderer {
  /**
   * Render a dependency graph as Mermaid diagram
   *
   * @param graph - The dependency graph to render
   * @param options - Rendering options (focus, limits, etc.)
   * @returns Mermaid diagram as string
   */
  public render(graph: DependencyGraph, options: DiagramOptions = {}): string {
    const { focus, maxNodes = 20, maxDepth = 1 } = options;

    // Apply depth and node limits
    const limitedGraph = this.applyLimits(graph, {
      focus,
      maxNodes,
      maxDepth,
    });

    // Render file-level graph (MVP)
    return this.renderFileGraph(limitedGraph, options);
  }

  /**
   * Apply depth and node count limits to the graph
   *
   * When focus is set, builds a subgraph centered on the focused node.
   * Otherwise, takes the first N nodes and their direct relationships.
   *
   * @param graph - The dependency graph to limit
   * @param options - Limit options (focus, maxNodes, maxDepth)
   * @returns Limited dependency graph
   */
  private applyLimits(
    graph: DependencyGraph,
    options: Pick<DiagramOptions, 'focus' | 'maxNodes' | 'maxDepth'> &
      Required<Pick<DiagramOptions, 'maxNodes' | 'maxDepth'>>,
  ): DependencyGraph {
    const { focus, maxNodes, maxDepth } = options;

    if (focus) {
      return this.buildFocusedSubgraph(graph, focus, maxDepth);
    }

    // No focus: just limit total nodes
    if (graph.files.length <= maxNodes) {
      return graph;
    }

    const limitedFiles = graph.files.slice(0, maxNodes);
    const fileSet = new Set(limitedFiles);

    const limitedRelationships = graph.fileRelationships.filter(
      (rel) => fileSet.has(rel.from) && fileSet.has(rel.to),
    );

    return {
      files: limitedFiles,
      fileRelationships: limitedRelationships,
      symbolRelationships: graph.symbolRelationships,
    };
  }

  /**
   * Build a subgraph focused on a specific file
   *
   * Includes the focused file and all files within maxDepth relationships.
   *
   * @param graph - The dependency graph to filter
   * @param focus - The file path to focus on
   * @param maxDepth - Maximum relationship depth from focus
   * @returns Filtered dependency graph
   */
  private buildFocusedSubgraph(
    graph: DependencyGraph,
    focus: string,
    maxDepth: number,
  ): DependencyGraph {
    // Normalize focus path
    const focusNormalized = this.normalizePath(focus);

    // Find files within depth from focus
    const relatedFiles = this.findRelatedFiles(graph, focusNormalized, maxDepth);

    // Filter relationships to only include related files
    const relatedFileSet = new Set(relatedFiles);
    const filteredRelationships = graph.fileRelationships.filter(
      (rel) => relatedFileSet.has(rel.from) && relatedFileSet.has(rel.to),
    );

    return {
      files: relatedFiles,
      fileRelationships: filteredRelationships,
      symbolRelationships: graph.symbolRelationships,
    };
  }

  /**
   * Find all files within maxDepth relationships from start file
   *
   * @param graph - The dependency graph to search
   * @param startFile - The starting file path
   * @param maxDepth - Maximum depth to search
   * @returns Array of related file paths
   */
  private findRelatedFiles(graph: DependencyGraph, startFile: string, maxDepth: number): string[] {
    const visited = new Set<string>();
    const queue: Array<{ file: string; depth: number }> = [{ file: startFile, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.file)) {
        continue;
      }

      visited.add(current.file);

      if (current.depth < maxDepth) {
        // Add neighbors (both incoming and outgoing)
        for (const rel of graph.fileRelationships) {
          if (rel.from === current.file && !visited.has(rel.to)) {
            queue.push({ file: rel.to, depth: current.depth + 1 });
          }
          if (rel.to === current.file && !visited.has(rel.from)) {
            queue.push({ file: rel.from, depth: current.depth + 1 });
          }
        }
      }
    }

    return Array.from(visited);
  }

  /**
   * Normalize path for comparison (handle relative paths, etc.)
   *
   * @param filePath - The file path to normalize
   * @returns Normalized file path
   */
  private normalizePath(filePath: string): string {
    return filePath;
  }

  /**
   * Render file-level dependency graph
   *
   * @param graph - The dependency graph to render
   * @param options - Rendering options
   * @returns Mermaid diagram string
   */
  private renderFileGraph(graph: DependencyGraph, options: DiagramOptions): string {
    const { focus } = options;
    let mermaid = 'graph TD\n';

    // Define nodes
    for (const file of graph.files) {
      const nodeId = this.sanitizeNodeId(file);
      const label = this.getNodeLabel(file);
      mermaid += `  ${nodeId}["${label}"]\n`;
    }

    // Add blank line for readability
    if (graph.files.length > 0 && graph.fileRelationships.length > 0) {
      mermaid += '\n';
    }

    // Define edges
    for (const rel of graph.fileRelationships) {
      const fromId = this.sanitizeNodeId(rel.from);
      const toId = this.sanitizeNodeId(rel.to);
      const edgeStyle = this.getEdgeStyle(rel);
      mermaid += `  ${fromId} ${edgeStyle} ${toId}\n`;
    }

    // Add focus highlighting
    if (focus) {
      const focusNormalized = this.normalizePath(focus);
      if (graph.files.includes(focusNormalized)) {
        mermaid += '\n';
        mermaid += this.highlightFocus(this.sanitizeNodeId(focusNormalized));
      }
    }

    return mermaid;
  }

  /**
   * Get edge style based on relationship kind
   *
   * - imports: solid arrow (--\>)
   * - uses: dotted arrow (-.-\>)
   *
   * @param rel - The file relationship
   * @returns Mermaid edge syntax string
   */
  private getEdgeStyle(rel: FileRelationship): string {
    switch (rel.kind) {
      case 'imports':
        return '-->';
      case 'uses':
        return '-.->';
      default:
        return '-->';
    }
  }

  /**
   * Get display label for a file node
   *
   * Uses basename for readability, but keeps package names for external deps.
   *
   * @param filePath - The file path to get label for
   * @returns Display label for the node
   */
  private getNodeLabel(filePath: string): string {
    // External package reference (starts with @ or no path separators)
    if (filePath.startsWith('@') || !filePath.includes('/')) {
      return filePath;
    }

    // Internal file - use basename
    return path.basename(filePath);
  }

  /**
   * Sanitize file path to valid Mermaid node ID
   *
   * Mermaid node IDs must be alphanumeric + underscore only.
   *
   * @param filePath - The file path to sanitize
   * @returns Sanitized node ID
   */
  private sanitizeNodeId(filePath: string): string {
    return (
      filePath
        .replace(/[^a-zA-Z0-9_]/g, '_')
        // Remove leading/trailing underscores
        .replace(/^_+|_+$/g, '') ||
      // Ensure non-empty
      'node'
    );
  }

  /**
   * Generate Mermaid style directive for focus highlighting
   *
   * @param nodeId - The node ID to highlight
   * @returns Mermaid style directive string
   */
  private highlightFocus(nodeId: string): string {
    return `  style ${nodeId} fill:#ff0,stroke:#f00,stroke-width:3px\n`;
  }
}
