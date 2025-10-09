/**
 * Import graph builder service for analyzing file dependencies
 *
 * Builds bidirectional import graphs from TypeDoc reflections by analyzing:
 * - Type references in variable/property types
 * - Extended types in classes/interfaces
 * - Implemented types in classes
 * - Type arguments in generic types
 *
 * Supports depth-limited BFS traversal to find all files within N hops
 * of starting entrypoints.
 *
 * @remarks
 * This service follows the SEAMS principle:
 * - MVP: Build graph with depth-limited BFS
 * - Extension point: Graph metadata can be enhanced later (e.g., edge weights)
 */

import { normalize } from 'node:path';
import type { DeclarationReflection } from 'typedoc';
import { TypeReferenceExtractor } from './typeReferenceExtractor.js';

/**
 * Configuration options for import graph building
 */
export interface ImportGraphOptions {
  /** Maximum traversal depth (0 = only start files) */
  maxDepth: number;
  /** Whether to ignore files in node_modules */
  ignoreNodeModules: boolean;
}

/**
 * Result of import graph building operation
 */
export interface ImportGraphResult {
  /** All files within maxDepth hops from start files */
  files: Set<string>;
  /** Directed edges: source file -\> set of imported files */
  edges: Map<string, Set<string>>;
}

/**
 * Service for building and traversing import dependency graphs
 */
export class ImportGraphBuilder {
  private readonly typeExtractor = new TypeReferenceExtractor();

  /**
   * Build import graph starting from entrypoint files
   *
   * @param allSymbols - All symbols from TypeDoc project
   * @param startFiles - Starting files (absolute paths)
   * @param options - Traversal options
   * @returns Graph with all reachable files and their import relationships
   */
  public build(
    allSymbols: DeclarationReflection[],
    startFiles: string[],
    options: ImportGraphOptions,
  ): ImportGraphResult {
    // Normalize start files
    const normalizedStartFiles = startFiles.map((f) => normalize(f));

    // Build file-to-reflections mapping
    const fileToReflections = this.buildFileMapping(allSymbols, options.ignoreNodeModules);

    // Build reflection-to-file lookup
    const reflectionToFile = this.buildReflectionMapping(allSymbols, options.ignoreNodeModules);

    // Extract all import edges
    const edges = this.buildEdges(fileToReflections, reflectionToFile);

    // Build reverse edges for "imported by" traversal
    const reverseEdges = this.buildReverseEdges(edges);

    // Perform BFS traversal with depth limit
    const reachableFiles = this.bfsTraversal(
      normalizedStartFiles,
      edges,
      reverseEdges,
      options.maxDepth,
    );

    return {
      files: reachableFiles,
      edges,
    };
  }

  /**
   * Build mapping from file paths to reflections defined in them
   *
   * @param allSymbols - All symbols from TypeDoc
   * @param ignoreNodeModules - Whether to filter out node_modules
   * @returns Map of file path to array of reflections
   */
  private buildFileMapping(
    allSymbols: DeclarationReflection[],
    ignoreNodeModules: boolean,
  ): Map<string, DeclarationReflection[]> {
    const fileMap = new Map<string, DeclarationReflection[]>();

    for (const symbol of allSymbols) {
      const filePath = this.getFilePath(symbol);
      if (!filePath) {
        continue;
      }

      // Filter node_modules if requested
      if (ignoreNodeModules && this.isNodeModules(filePath)) {
        continue;
      }

      const existing = fileMap.get(filePath) || [];
      existing.push(symbol);
      fileMap.set(filePath, existing);
    }

    return fileMap;
  }

  /**
   * Build mapping from reflection IDs to file paths
   *
   * @param allSymbols - All symbols from TypeDoc
   * @param ignoreNodeModules - Whether to filter out node_modules
   * @returns Map of reflection ID to file path
   */
  private buildReflectionMapping(
    allSymbols: DeclarationReflection[],
    ignoreNodeModules: boolean,
  ): Map<number, string> {
    const reflectionMap = new Map<number, string>();

    for (const symbol of allSymbols) {
      const filePath = this.getFilePath(symbol);
      if (!filePath) {
        continue;
      }

      // Filter node_modules if requested
      if (ignoreNodeModules && this.isNodeModules(filePath)) {
        continue;
      }

      reflectionMap.set(symbol.id, filePath);
    }

    return reflectionMap;
  }

  /**
   * Build directed edges between files based on type references
   *
   * @param fileToReflections - Mapping from files to reflections
   * @param reflectionToFile - Mapping from reflection IDs to files
   * @returns Map of source file to set of imported files
   */
  private buildEdges(
    fileToReflections: Map<string, DeclarationReflection[]>,
    reflectionToFile: Map<number, string>,
  ): Map<string, Set<string>> {
    const edges = new Map<string, Set<string>>();

    // For each file, analyze all reflections in it
    for (const [sourceFile, reflections] of fileToReflections.entries()) {
      const imports = new Set<string>();

      for (const reflection of reflections) {
        // Extract all type references from this reflection
        const referencedReflectionIds = this.typeExtractor.extract(reflection);

        // Find which files these references come from
        for (const refId of referencedReflectionIds) {
          const targetFile = reflectionToFile.get(refId);
          if (targetFile && targetFile !== sourceFile) {
            imports.add(targetFile);
          }
        }
      }

      if (imports.size > 0) {
        edges.set(sourceFile, imports);
      }
    }

    return edges;
  }

  /**
   * Build reverse edges (imported by relationships)
   *
   * @param edges - Forward edges (imports)
   * @returns Reverse edges (imported by)
   */
  private buildReverseEdges(edges: Map<string, Set<string>>): Map<string, Set<string>> {
    const reverseEdges = new Map<string, Set<string>>();

    for (const [source, targets] of edges.entries()) {
      for (const target of targets) {
        const importedBy = reverseEdges.get(target) || new Set<string>();
        importedBy.add(source);
        reverseEdges.set(target, importedBy);
      }
    }

    return reverseEdges;
  }

  /**
   * Perform BFS traversal from start files with depth limit
   *
   * Traverses both forward (imports) and backward (imported by) edges
   * to find all files within maxDepth hops.
   *
   * @param startFiles - Starting file paths
   * @param edges - Forward edges (imports)
   * @param reverseEdges - Reverse edges (imported by)
   * @param maxDepth - Maximum traversal depth
   * @returns Set of all reachable files
   */
  private bfsTraversal(
    startFiles: string[],
    edges: Map<string, Set<string>>,
    reverseEdges: Map<string, Set<string>>,
    maxDepth: number,
  ): Set<string> {
    const visited = new Set<string>();
    const queue: Array<{ file: string; depth: number }> = [];

    // Initialize queue with start files
    for (const file of startFiles) {
      queue.push({ file, depth: 0 });
      visited.add(file);
    }

    // BFS traversal
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      this.processNode(current, edges, reverseEdges, maxDepth, visited, queue);
    }

    return visited;
  }

  /**
   * Process a single BFS node and add unvisited neighbors to queue
   *
   * @param current - Current node being processed
   * @param edges - Forward edges (imports)
   * @param reverseEdges - Reverse edges (imported by)
   * @param maxDepth - Maximum traversal depth
   * @param visited - Set of visited files
   * @param queue - BFS queue
   */
  private processNode(
    current: { file: string; depth: number },
    edges: Map<string, Set<string>>,
    reverseEdges: Map<string, Set<string>>,
    maxDepth: number,
    visited: Set<string>,
    queue: Array<{ file: string; depth: number }>,
  ): void {
    const { file, depth } = current;

    // Don't traverse beyond maxDepth
    if (depth >= maxDepth) {
      return;
    }

    // Collect all neighbors (both directions)
    const neighbors = this.collectNeighbors(file, edges, reverseEdges);

    // Add unvisited neighbors to queue
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ file: neighbor, depth: depth + 1 });
      }
    }
  }

  /**
   * Collect all neighboring files (both imports and imported-by)
   *
   * @param file - Current file
   * @param edges - Forward edges (imports)
   * @param reverseEdges - Reverse edges (imported by)
   * @returns Set of neighboring files
   */
  private collectNeighbors(
    file: string,
    edges: Map<string, Set<string>>,
    reverseEdges: Map<string, Set<string>>,
  ): Set<string> {
    const neighbors = new Set<string>();

    // Add files that this file imports
    const imports = edges.get(file);
    if (imports) {
      for (const imported of imports) {
        neighbors.add(imported);
      }
    }

    // Add files that import this file
    const importedBy = reverseEdges.get(file);
    if (importedBy) {
      for (const importer of importedBy) {
        neighbors.add(importer);
      }
    }

    return neighbors;
  }

  /**
   * Extract absolute file path from a reflection
   *
   * @param reflection - Reflection to extract path from
   * @returns Normalized absolute file path or undefined
   */
  private getFilePath(reflection: DeclarationReflection): string | undefined {
    const sourceFile = reflection.sources?.[0];
    const rawPath = sourceFile?.fullFileName || sourceFile?.fileName;
    return rawPath ? normalize(rawPath) : undefined;
  }

  /**
   * Check if a file path is in node_modules
   *
   * @param filePath - File path to check
   * @returns True if path contains /node_modules/
   */
  private isNodeModules(filePath: string): boolean {
    return filePath.includes('/node_modules/') || filePath.includes('\\node_modules\\');
  }
}
