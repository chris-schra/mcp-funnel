/**
 * Diagram generator exports
 *
 * Provides components for generating Mermaid diagrams from symbol metadata.
 */

export type {
  DependencyGraph,
  DiagramFormat,
  DiagramOptions,
  FileRelationship,
  FileRelationshipKind,
  IDiagramRenderer,
  IGraphBuilder,
  SymbolRelationship,
  SymbolRelationshipKind,
} from './types.js';

export { GraphBuilder } from './graphBuilder.js';
export { MermaidRenderer } from './mermaidRenderer.js';
