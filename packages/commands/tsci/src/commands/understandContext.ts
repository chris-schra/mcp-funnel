/**
 * Command handler for understand_context/understand-context tool.
 *
 * Validates files array, discovers imports via graph traversal, and generates Mermaid diagram.
 */

import { resolve } from 'node:path';
import type { CallToolResult } from '@mcp-funnel/commands-core';
import { ReflectionKind } from 'typedoc';
import type { DeclarationReflection } from 'typedoc';
import { validateFileArray, validateFilePath } from '../util/validation.js';
import { createErrorResponse, createTextResponse } from '../util/responses.js';
import { ImportGraphBuilder } from '../services/importGraphBuilder.js';
import type { UnderstandContextArgs, CommandContext } from './types.js';

/**
 * Handles understand_context tool execution.
 *
 * @param args - Validated and typed arguments
 * @param context - Command execution context
 * @returns CallToolResult with Mermaid diagram or error
 */
export async function understandContext(
  args: UnderstandContextArgs,
  context: CommandContext,
): Promise<CallToolResult> {
  // Validate files array
  const filesValidation = validateFileArray(args.files);
  if (!filesValidation.valid) {
    return createErrorResponse(filesValidation.error);
  }

  // Validate focus (optional)
  let focus: string | undefined;
  if (args.focus !== undefined) {
    const focusValidation = validateFilePath(args.focus);
    if (!focusValidation.valid) {
      return createErrorResponse(focusValidation.error);
    }
    focus = resolve(process.cwd(), focusValidation.value);
  }

  // Ensure engine and symbol index are available
  if (!context.engine || !context.symbolIndex) {
    return createErrorResponse('Engine not initialized. Internal error.');
  }

  // Normalize entrypoint files to absolute paths
  const startFiles = filesValidation.value.map((file) => resolve(process.cwd(), file));

  // Get all reflections from TypeDoc project for import graph building
  const project = context.engine.getProject();
  if (!project) {
    return createErrorResponse('TypeDoc project not available. Engine initialization failed.');
  }

  const topLevelKinds =
    ReflectionKind.Function |
    ReflectionKind.Class |
    ReflectionKind.Interface |
    ReflectionKind.TypeAlias |
    ReflectionKind.Enum |
    ReflectionKind.Variable |
    ReflectionKind.Namespace;

  const allReflections = project.getReflectionsByKind(topLevelKinds) as DeclarationReflection[];

  // Build import graph with auto-discovery
  const graphBuilder = new ImportGraphBuilder();
  const maxDepth = args.maxDepth ?? 3;
  const ignoreNodeModules = args.ignoreNodeModules ?? false;

  const graph = graphBuilder.build(allReflections, startFiles, { maxDepth, ignoreNodeModules });

  // Get SymbolMetadata for all discovered files from symbol index
  const allSymbols = context.symbolIndex.getAll();
  const discoveredSymbols = allSymbols.filter((symbol) => {
    return symbol.filePath && graph.files.has(symbol.filePath);
  });

  if (discoveredSymbols.length === 0) {
    return createErrorResponse(
      'No symbols found for the specified files. ' +
        'Files may not exist or may not be part of the TypeScript project.',
    );
  }

  // Generate diagram with all discovered files
  const diagram = context.diagramGenerator.generate(discoveredSymbols, { focus });

  const hint =
    graph.files.size > startFiles.length
      ? `Discovered ${graph.files.size} files (${graph.files.size - startFiles.length} via imports). ` +
        'Render this Mermaid diagram to visualize file relationships and dependencies'
      : 'Render this Mermaid diagram to visualize file relationships and dependencies';

  return createTextResponse(diagram, hint);
}
