/**
 * Command handler for describe_symbol/describe-symbol tool.
 *
 * Validates symbol ID, looks up symbol, formats output as YAML.
 */

import type { CallToolResult } from '@mcp-funnel/commands-core';
import { validateSymbolId } from '../util/validation.js';
import { createErrorResponse, createTextResponse } from '../util/responses.js';
import type { DescribeSymbolArgs, CommandContext } from './types.js';

/**
 * Handles describe_symbol tool execution.
 *
 * @param args - Validated and typed arguments
 * @param context - Command execution context
 * @returns CallToolResult with YAML formatted symbol description or error
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

  // Format output as YAML
  // Note: verbosity parameter is ignored for now as YAML formatter includes all details by default
  const output = context.yamlSymbolFormatter.format(symbol);

  return createTextResponse(output);
}
