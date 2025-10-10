/**
 * Command handler for describe_symbol/describe-symbol tool.
 *
 * Validates symbol ID, looks up symbol, formats output as YAML.
 * Optionally runs enhancement pipeline to populate usages and references.
 */

import type { CallToolResult } from '@mcp-funnel/commands-core';
import { validateSymbolId } from '../util/validation.js';
import { createErrorResponse, createTextResponse } from '../util/responses.js';
import type { DescribeSymbolArgs, CommandContext } from './types.js';
import { EnhancementPipeline } from '../enhancers/enhancementPipeline.js';
import { ReferenceEnhancer } from '../enhancers/referenceEnhancer.js';

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

  // Ensure symbol index and engine are available
  if (!context.symbolIndex || !context.engine) {
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

  // Run enhancement pipeline to populate usages and references
  // This is optional - if TypeScript context is not available, we skip enhancement
  const symbolCollector = context.engine.getSymbolCollector();
  const enhancementContext = symbolCollector.getEnhancementContext(
    context.symbolIndex.getAllSymbolsMap(),
  );

  if (enhancementContext) {
    const pipeline = new EnhancementPipeline([new ReferenceEnhancer()]);

    const result = await pipeline.enhance([symbol], enhancementContext);

    // Log errors but don't fail the command - we can still return symbol info
    if (result.errors.length > 0) {
      console.warn(`Warning: Enhancement pipeline had ${result.errors.length} error(s)`);
      for (const error of result.errors) {
        console.warn(`  - ${error.enhancer}: ${error.error.message}`);
      }
    }
  }

  // Format output as YAML
  // Note: verbosity parameter is ignored for now as YAML formatter includes all details by default
  // Pass symbolIndex to enable member extraction for classes/interfaces/types
  const output = context.yamlSymbolFormatter.format(symbol, { symbolIndex: context.symbolIndex });

  return createTextResponse(output);
}
