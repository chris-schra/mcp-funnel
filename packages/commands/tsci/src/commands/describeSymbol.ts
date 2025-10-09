/**
 * Command handler for describe_symbol/describe-symbol tool.
 *
 * Validates symbol ID, looks up symbol, formats output with requested verbosity.
 */

import type { CallToolResult } from '@mcp-funnel/commands-core';
import { validateSymbolId, validateVerbosity } from '../util/validation.js';
import { createErrorResponse, createTextResponse } from '../util/responses.js';
import type { VerbosityLevel } from '../formatters/types.js';
import type { DescribeSymbolArgs, CommandContext } from './types.js';

/**
 * Handles describe_symbol tool execution.
 *
 * @param args - Validated and typed arguments
 * @param context - Command execution context
 * @returns CallToolResult with formatted symbol description or error
 */
export async function describeSymbol(
  args: DescribeSymbolArgs,
  context: CommandContext,
): Promise<CallToolResult> {
  // Validate symbol ID
  const symbolIdValidation = validateSymbolId(args.symbolId);
  if (!symbolIdValidation.valid) {
    return createErrorResponse(symbolIdValidation.error);
  }

  // Validate verbosity (optional, defaults to minimal)
  const verbosityValidation = validateVerbosity(args.verbosity);
  if (!verbosityValidation.valid) {
    return createErrorResponse(verbosityValidation.error);
  }
  const verbosity: VerbosityLevel = verbosityValidation.value || 'minimal';

  // Ensure symbol index is available
  if (!context.symbolIndex) {
    return createErrorResponse('Engine not initialized. Internal error.');
  }

  // Get symbol by ID
  const symbol = context.symbolIndex.getById(symbolIdValidation.value);
  if (!symbol) {
    return createErrorResponse(
      `Symbol not found: ${symbolIdValidation.value}. ` +
        `Use read_file to get valid symbol IDs from YAML structure.`,
    );
  }

  // Format output
  const output = context.symbolFormatter.format(symbol, { verbosity });

  // Return with optional hint for more detail
  const hint =
    verbosity === 'minimal'
      ? 'Use verbosity: "normal" or "detailed" to see usage locations and external references'
      : undefined;

  return createTextResponse(JSON.stringify(output, null, 2), hint);
}
