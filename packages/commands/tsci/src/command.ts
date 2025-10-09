/**
 * TSCI Command implementation for MCP Funnel.
 *
 * Provides TypeScript Code Intelligence tools for AI-powered codebase exploration:
 * - describe_file: Get symbols and types from a TypeScript file (minimal by default)
 * - describe_symbol: Get detailed information about a specific symbol
 * - understand_context: Generate Mermaid diagram showing file relationships
 *
 * Supports both MCP protocol tool calls and direct CLI execution.
 * Engine initialization is lazy (on first tool call) to avoid expensive TypeDoc bootstrapping.
 *
 * @example MCP tool usage
 * ```typescript
 * const cmd = new TSCICommand();
 * const result = await cmd.executeToolViaMCP('describe_file', {
 *   file: 'src/command.ts',
 *   verbosity: 'minimal'
 * });
 * ```
 * @public
 * @see file:./core/engine.ts - TypeDoc engine wrapper
 * @see file:./formatters/describeFileFormatter.ts - File output formatter
 * @see file:./formatters/describeSymbolFormatter.ts - Symbol output formatter
 */

import { resolve } from 'node:path';
import type { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import { TypeDocEngine } from './core/engine.js';
import { SymbolIndex } from './core/symbolIndex.js';
import { DescribeFileFormatter, DescribeSymbolFormatter } from './formatters/index.js';
import { DiagramGenerator } from './services/diagramGenerator.js';
import { resolveTsConfig } from './util/tsconfig.js';
import {
  validateFilePath,
  validateSymbolId,
  validateVerbosity,
  validateFileArray,
} from './util/validation.js';
import { createErrorResponse, createTextResponse } from './util/responses.js';
import type { VerbosityLevel } from './formatters/types.js';

/**
 * TSCI Command implementation.
 *
 * Implements ICommand interface for MCP Funnel integration.
 * Lazily initializes TypeDoc engine on first tool call for performance.
 */
export class TSCICommand implements ICommand {
  public readonly name = 'tsci';
  public readonly description = 'TypeScript Code Intelligence - AI-optimized codebase exploration';

  private engine?: TypeDocEngine;
  private symbolIndex?: SymbolIndex;
  private readonly fileFormatter: DescribeFileFormatter;
  private readonly symbolFormatter: DescribeSymbolFormatter;
  private readonly diagramGenerator: DiagramGenerator;

  /**
   * Creates TSCI command instance.
   *
   * Formatters and diagram generator are initialized eagerly (lightweight),
   * but TypeDoc engine is initialized lazily on first tool call.
   */
  public constructor() {
    this.fileFormatter = new DescribeFileFormatter();
    this.symbolFormatter = new DescribeSymbolFormatter();
    this.diagramGenerator = new DiagramGenerator();
  }

  /**
   * Returns MCP tool definitions for describe_file, describe_symbol, and understand_context.
   *
   * Provides tool schemas that describe parameters, types, and requirements
   * for the MCP protocol integration.
   * @returns Array of tool definitions with input schemas
   */
  public getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'describe_file',
        description:
          'Get symbols and type information for a TypeScript file (minimal output by default for token efficiency)',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File path relative to project root',
            },
            verbosity: {
              type: 'string',
              enum: ['minimal', 'normal', 'detailed'],
              description: 'Output verbosity (default: minimal for low token usage)',
            },
          },
          required: ['file'],
        },
      },
      {
        name: 'describe_symbol',
        description:
          'Get detailed information about a specific symbol by ID (from describe_file output)',
        inputSchema: {
          type: 'object',
          properties: {
            symbolId: {
              type: 'string',
              description: 'Symbol ID from describe_file output',
            },
            verbosity: {
              type: 'string',
              enum: ['minimal', 'normal', 'detailed'],
              description: 'Output verbosity (default: minimal)',
            },
          },
          required: ['symbolId'],
        },
      },
      {
        name: 'understand_context',
        description: 'Generate Mermaid diagram showing file relationships and dependencies',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to include in diagram (relative to project root)',
            },
            focus: {
              type: 'string',
              description: 'File to highlight in the diagram (optional)',
            },
          },
          required: ['files'],
        },
      },
    ];
  }

  /**
   * Executes a tool via MCP protocol.
   *
   * Validates parameters, ensures engine is initialized, and routes to
   * appropriate handler. All error cases return CallToolResult with isError flag.
   * @param toolName - Name of the tool to execute
   * @param args - Tool arguments from MCP client
   * @returns CallToolResult with formatted data or error message
   * @throws Never throws - all errors are returned as CallToolResult
   */
  public async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      // Ensure engine is initialized before handling any tool
      await this.ensureEngine();

      // Route to appropriate handler
      switch (toolName) {
        case 'describe_file':
          return await this.handleDescribeFile(args);

        case 'describe_symbol':
          return await this.handleDescribeSymbol(args);

        case 'understand_context':
          return await this.handleUnderstandContext(args);

        default:
          return createErrorResponse(`Error: Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return createErrorResponse(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Executes command via CLI interface.
   *
   * Currently provides a helpful message directing users to use MCP protocol.
   * CLI support can be added in future if needed.
   *
   * @param _args - CLI arguments array (reserved for future CLI support)
   * @returns Promise that resolves when execution completes
   */
  public async executeViaCLI(_args: string[]): Promise<void> {
    console.error('TSCI command is designed for MCP protocol usage.');
    console.error('Please use it through an MCP-compatible client (e.g., Claude Desktop).');
    console.error('');
    console.error('Available tools:');
    console.error('  - describe_file: Get symbols from a TypeScript file');
    console.error('  - describe_symbol: Get details about a specific symbol');
    console.error('  - understand_context: Generate dependency diagram for files');
    process.exit(1);
  }

  /**
   * Ensures TypeDoc engine is initialized and ready.
   *
   * Lazy initialization pattern - only bootstraps TypeDoc on first tool call.
   * This avoids expensive initialization when command is just being discovered.
   * @throws Error if tsconfig.json cannot be found or initialization fails
   */
  private async ensureEngine(): Promise<void> {
    if (this.engine) {
      // Already initialized
      return;
    }

    // Find tsconfig.json
    const tsconfigPath = resolveTsConfig(process.cwd());
    if (!tsconfigPath.exists) {
      throw new Error(
        'No tsconfig.json found. Please run this command from a TypeScript project root or a subdirectory of one.',
      );
    }

    // Create and initialize engine
    this.engine = new TypeDocEngine({
      tsconfig: tsconfigPath.path,
    });

    await this.engine.initialize();
    await this.engine.convertProject();

    // Build symbol index
    const symbols = this.engine.getSymbols();
    this.symbolIndex = new SymbolIndex();
    this.symbolIndex.addMany(symbols);
  }

  /**
   * Handles describe_file tool execution.
   *
   * Validates file path, looks up symbols, formats output with requested verbosity.
   * @param args - Tool arguments (file, verbosity)
   * @returns CallToolResult with formatted file description or error
   */
  private async handleDescribeFile(args: Record<string, unknown>): Promise<CallToolResult> {
    // Validate file path
    const fileValidation = validateFilePath(args.file);
    if (!fileValidation.valid) {
      return createErrorResponse(fileValidation.error);
    }

    // Validate verbosity (optional, defaults to minimal)
    const verbosityValidation = validateVerbosity(args.verbosity);
    if (!verbosityValidation.valid) {
      return createErrorResponse(verbosityValidation.error);
    }
    const verbosity: VerbosityLevel = verbosityValidation.value || 'minimal';

    // Get symbols for the file
    // Normalize to absolute path for lookup
    const absolutePath = resolve(process.cwd(), fileValidation.value);
    const symbols = this.symbolIndex!.getByFile(absolutePath);
    if (symbols.length === 0) {
      return createErrorResponse(
        `No symbols found in file: ${fileValidation.value}. ` +
          `File may not exist or may not be part of the TypeScript project.`,
      );
    }

    // Format output
    const output = this.fileFormatter.format(symbols, { verbosity });

    // Return with optional hint for more detail
    const hint =
      verbosity === 'minimal'
        ? 'Use verbosity: "normal" or "detailed" to see usage locations and external references'
        : undefined;

    return createTextResponse(JSON.stringify(output, null, 2), hint);
  }

  /**
   * Handles describe_symbol tool execution.
   *
   * Validates symbol ID, looks up symbol, formats output with requested verbosity.
   * @param args - Tool arguments (symbolId, verbosity)
   * @returns CallToolResult with formatted symbol description or error
   */
  private async handleDescribeSymbol(args: Record<string, unknown>): Promise<CallToolResult> {
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

    // Get symbol by ID
    const symbol = this.symbolIndex!.getById(symbolIdValidation.value);
    if (!symbol) {
      return createErrorResponse(
        `Symbol not found: ${symbolIdValidation.value}. ` +
          `Use describe_file to get valid symbol IDs.`,
      );
    }

    // Format output
    const output = this.symbolFormatter.format(symbol, { verbosity });

    // Return with optional hint for more detail
    const hint =
      verbosity === 'minimal'
        ? 'Use verbosity: "normal" or "detailed" to see usage locations and external references'
        : undefined;

    return createTextResponse(JSON.stringify(output, null, 2), hint);
  }

  /**
   * Handles understand_context tool execution.
   *
   * Validates files array and optional focus file, generates Mermaid diagram.
   * @param args - Tool arguments (files, focus)
   * @returns CallToolResult with Mermaid diagram or error
   */
  private async handleUnderstandContext(args: Record<string, unknown>): Promise<CallToolResult> {
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

    // Get all symbols for requested files
    // Normalize all file paths to absolute
    const allSymbols = filesValidation.value.flatMap((file) => {
      const absolutePath = resolve(process.cwd(), file);
      return this.symbolIndex!.getByFile(absolutePath);
    });

    if (allSymbols.length === 0) {
      return createErrorResponse(
        'No symbols found for the specified files. ' +
          'Files may not exist or may not be part of the TypeScript project.',
      );
    }

    // Generate diagram
    const diagram = this.diagramGenerator.generate(allSymbols, { focus });

    return createTextResponse(
      diagram,
      'Render this Mermaid diagram to visualize file relationships and dependencies',
    );
  }
}
