/**
 * Command handler for understand_context/understand-context tool.
 *
 * Validates files array and optional focus file, generates Mermaid diagram.
 */

import { resolve } from 'node:path';
import type { CallToolResult } from '@mcp-funnel/commands-core';
import { validateFileArray, validateFilePath } from '../util/validation.js';
import { createErrorResponse, createTextResponse } from '../util/responses.js';
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

  // Ensure symbol index is available
  if (!context.symbolIndex) {
    return createErrorResponse('Engine not initialized. Internal error.');
  }

  // Get all symbols for requested files
  // Normalize all file paths to absolute
  const allSymbols = filesValidation.value.flatMap((file) => {
    const absolutePath = resolve(process.cwd(), file);
    return context.symbolIndex!.getByFile(absolutePath);
  });

  if (allSymbols.length === 0) {
    return createErrorResponse(
      'No symbols found for the specified files. ' +
        'Files may not exist or may not be part of the TypeScript project.',
    );
  }

  // Generate diagram
  const diagram = context.diagramGenerator.generate(allSymbols, { focus });

  return createTextResponse(
    diagram,
    'Render this Mermaid diagram to visualize file relationships and dependencies',
  );
}
