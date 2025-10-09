/**
 * Main diagram generator orchestrator
 *
 * Coordinates graph building and rendering to produce Mermaid diagrams.
 * Provides a simple API for generating diagrams from symbol metadata.
 */

import type { SymbolMetadata } from '../formatters/types.js';
import {
  GraphBuilder,
  MermaidRenderer,
  type DiagramOptions,
  type IDiagramRenderer,
  type IGraphBuilder,
} from './diagramGenerator/index.js';

/**
 * Diagram generator that orchestrates graph building and rendering
 *
 * SEAM: Constructor accepts custom builder/renderer for testing or extension
 */
export class DiagramGenerator {
  private readonly graphBuilder: IGraphBuilder;
  private readonly renderer: IDiagramRenderer;

  public constructor(graphBuilder?: IGraphBuilder, renderer?: IDiagramRenderer) {
    this.graphBuilder = graphBuilder || new GraphBuilder();
    this.renderer = renderer || new MermaidRenderer();
  }

  /**
   * Generate a diagram from symbol metadata
   *
   * @param symbols - Array of analyzed symbols
   * @param options - Diagram options (format, focus, limits)
   * @returns Diagram as string (Mermaid syntax by default)
   *
   * @example
   * ```typescript
   * const generator = new DiagramGenerator();
   * const diagram = generator.generate(symbols, {
   *   focus: 'src/index.ts',
   *   maxDepth: 2
   * });
   * ```
   */
  public generate(symbols: SymbolMetadata[], options: DiagramOptions = {}): string {
    // Build dependency graph
    const graph = this.graphBuilder.buildGraph(symbols);

    // Render as diagram
    return this.renderer.render(graph, options);
  }
}

/**
 * Convenience function for one-off diagram generation
 *
 * @param symbols - Array of analyzed symbols
 * @param options - Diagram options
 * @returns Mermaid diagram string
 *
 * @example
 * ```typescript
 * const diagram = generateDiagram(symbols, {
 *   focus: 'command.ts',
 *   maxNodes: 15
 * });
 * ```
 */
export function generateDiagram(symbols: SymbolMetadata[], options?: DiagramOptions): string {
  const generator = new DiagramGenerator();
  return generator.generate(symbols, options);
}
