/**
 * TSCI Command implementation for MCP Funnel.
 *
 * Provides TypeScript Code Intelligence tools for AI-powered codebase exploration:
 * - read_file: Read files with automatic structure optimization (full content or YAML)
 * - describe_symbol: Get detailed information about a specific symbol
 * - understand_context: Generate Mermaid diagram showing file relationships
 *
 * Supports both MCP protocol tool calls and direct CLI execution.
 * Engine initialization is lazy (on first tool call) to avoid expensive TypeDoc bootstrapping.
 *
 * @example MCP tool usage
 * ```typescript
 * const cmd = new TSCICommand();
 * const result = await cmd.executeToolViaMCP('read_file', {
 *   file: 'src/command.ts',
 *   verbosity: 'minimal'
 * });
 * ```
 * @public
 * @see file:./core/engine.ts - TypeDoc engine wrapper
 * @see file:./formatters/describeFileFormatter.ts - File output formatter
 * @see file:./formatters/describeSymbolFormatter.ts - Symbol output formatter
 */

import type { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import { TypeDocEngine } from './core/engine.js';
import { SymbolIndex } from './core/symbolIndex.js';
import { DescribeFileFormatter, DescribeSymbolFormatter } from './formatters/index.js';
import { YAMLDescribeFileFormatter } from './formatters/yamlDescribeFileFormatter.js';
import { YAMLDescribeSymbolFormatter } from './formatters/yamlDescribeSymbolFormatter.js';
import { DiagramGenerator } from './services/diagramGenerator.js';
import { resolveTsConfig } from './util/tsconfig.js';
import { findNearestTsconfig } from './util/findNearestTsconfig.js';
import { createErrorResponse } from './util/responses.js';
import { CLIHandlers } from './cliHandlers.js';
import { describeFile } from './commands/describeFile.js';
import { describeSymbol } from './commands/describeSymbol.js';
import { understandContext } from './commands/understandContext.js';
import { getTSCIToolDefinitions } from './mcpDefinitions.js';
import type {
  CommandContext,
  DescribeFileArgs,
  DescribeSymbolArgs,
  UnderstandContextArgs,
} from './commands/types.js';
import type { CommandArgs } from './types/common.js';

/**
 * TSCI Command implementation.
 *
 * Implements ICommand interface for MCP Funnel integration.
 * Lazily initializes TypeDoc engine on first tool call for performance.
 */
export class TSCICommand implements ICommand<CommandArgs> {
  public readonly name = 'tsci';
  public readonly description = 'TypeScript Code Intelligence - AI-optimized codebase exploration';

  private engine?: TypeDocEngine;
  private symbolIndex?: SymbolIndex;
  private readonly fileFormatter: DescribeFileFormatter;
  private readonly symbolFormatter: DescribeSymbolFormatter;
  private readonly yamlFormatter: YAMLDescribeFileFormatter;
  private readonly yamlSymbolFormatter: YAMLDescribeSymbolFormatter;
  private readonly diagramGenerator: DiagramGenerator;
  private readonly cliHandlers: CLIHandlers;

  /**
   * Creates TSCI command instance.
   *
   * Formatters and diagram generator are initialized eagerly (lightweight),
   * but TypeDoc engine is initialized lazily on first tool call.
   * Note: yamlSymbolFormatter is initialized without symbolIndex as it's not yet available.
   * The symbolIndex will be passed via format() options when needed.
   */
  public constructor() {
    this.fileFormatter = new DescribeFileFormatter();
    this.symbolFormatter = new DescribeSymbolFormatter();
    this.yamlFormatter = new YAMLDescribeFileFormatter();
    this.yamlSymbolFormatter = new YAMLDescribeSymbolFormatter();
    this.diagramGenerator = new DiagramGenerator();
    this.cliHandlers = new CLIHandlers(this);
  }

  /**
   * Returns MCP tool definitions for read_file, describe_symbol, and understand_context.
   *
   * Provides tool schemas that describe parameters, types, and requirements
   * for the MCP protocol integration.
   * @returns Array of tool definitions with input schemas
   */
  public getMCPDefinitions(): Tool[] {
    return getTSCIToolDefinitions();
  }

  /**
   * Routes tool/command name to appropriate handler.
   *
   * Supports both MCP tool names (read_file, describe_symbol, understand_context)
   * and CLI command names (describe-file, describe-symbol, understand-context).
   *
   * Exposed publicly for CLI handlers to use.
   *
   * @param name - Tool or command name
   * @param args - Tool arguments
   * @returns CallToolResult with formatted data or error
   */
  public async executeHandler(name: string, args: CommandArgs): Promise<CallToolResult> {
    switch (name) {
      case 'read_file':
      case 'describe-file':
        // describeFile initializes engine as needed (lazy init for small files)
        return await describeFile(
          args as DescribeFileArgs,
          () => this.getPartialContext(),
          (file) => this.ensureEngine(file),
        );

      case 'describe_symbol':
      case 'describe-symbol': {
        // Initialize engine with optional file hint for cross-project lookups
        const symbolArgs = args as DescribeSymbolArgs;
        await this.ensureEngine(symbolArgs.file);
        return await describeSymbol(symbolArgs, this.getContext());
      }

      case 'understand_context':
      case 'understand-context': {
        // Initialize engine with first file to detect tsconfig, but analyze full project
        const contextArgs = args as UnderstandContextArgs;
        const firstFile = contextArgs.files?.[0];
        await this.ensureEngine(firstFile, { fullProject: true });
        return await understandContext(contextArgs, this.getContext());
      }

      default:
        return createErrorResponse(`Error: Unknown tool: ${name}`);
    }
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
  public async executeToolViaMCP(toolName: string, args: CommandArgs): Promise<CallToolResult> {
    try {
      return await this.executeHandler(toolName, args);
    } catch (error) {
      return createErrorResponse(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Executes command via CLI interface.
   *
   * Supports three subcommands:
   * - describe-file: Get symbols and types from a TypeScript file
   * - describe-symbol: Get detailed information about a specific symbol
   * - understand-context: Generate Mermaid diagram showing file relationships
   *
   * @param args - CLI arguments array (subcommand followed by arguments)
   * @returns Promise that resolves when execution completes
   */
  public async executeViaCLI(args: string[]): Promise<void> {
    const subcommand = args[0];

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
      this.cliHandlers.showHelp();
      process.exit(subcommand ? 0 : 1);
    }

    try {
      // Each command handler manages engine initialization as needed
      switch (subcommand) {
        case 'describe-file':
          await this.cliHandlers.handleDescribeFile(args.slice(1));
          break;

        case 'describe-symbol':
          await this.cliHandlers.handleDescribeSymbol(args.slice(1));
          break;

        case 'understand-context':
          await this.cliHandlers.handleUnderstandContext(args.slice(1));
          break;

        default:
          console.error(`Error: Unknown command: ${subcommand}`);
          console.error('');
          this.cliHandlers.showHelp();
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Cleans up engine resources.
   * Should be called when command execution is complete.
   */
  public cleanup(): void {
    this.engine?.cleanup();
  }

  /**
   * Gets command execution context for handlers.
   * @returns CommandContext with all required resources
   * @throws Error if engine is not initialized
   */
  private getContext(): CommandContext {
    if (!this.engine || !this.symbolIndex) {
      throw new Error('Engine not initialized. Call ensureEngine() first.');
    }

    return {
      engine: this.engine,
      symbolIndex: this.symbolIndex,
      fileFormatter: this.fileFormatter,
      symbolFormatter: this.symbolFormatter,
      yamlFormatter: this.yamlFormatter,
      yamlSymbolFormatter: this.yamlSymbolFormatter,
      diagramGenerator: this.diagramGenerator,
    };
  }

  /**
   * Gets partial context without requiring engine initialization.
   * Used for describeFile which initializes engine lazily.
   * @returns CommandContext with formatters (engine/symbolIndex may be undefined)
   */
  private getPartialContext(): CommandContext {
    return {
      engine: this.engine,
      symbolIndex: this.symbolIndex,
      fileFormatter: this.fileFormatter,
      symbolFormatter: this.symbolFormatter,
      yamlFormatter: this.yamlFormatter,
      yamlSymbolFormatter: this.yamlSymbolFormatter,
      diagramGenerator: this.diagramGenerator,
    };
  }

  /**
   * Ensures TypeDoc engine is initialized and ready.
   *
   * Lazy initialization pattern - only bootstraps TypeDoc on first tool call.
   * This avoids expensive initialization when command is just being discovered.
   *
   * For monorepo support, accepts an optional file path to detect the nearest
   * tsconfig.json. If the detected tsconfig differs from the current engine's,
   * the engine is reinitialized.
   *
   * Exposed publicly for CLI handlers to use.
   *
   * @param forFile - Optional file path to detect nearest tsconfig.json for
   * @param options - Engine initialization options. Set fullProject:true to analyze entire project instead of just forFile (default: false)
   * @throws Error if tsconfig.json cannot be found or initialization fails
   */
  public async ensureEngine(forFile?: string, options?: { fullProject?: boolean }): Promise<void> {
    let tsconfigPath: string;

    // Detect tsconfig for the specific file if provided
    if (forFile) {
      const detected = findNearestTsconfig(forFile);
      if (!detected) {
        throw new Error(
          `No tsconfig.json found for ${forFile}. ` +
            'Please ensure the file is part of a TypeScript project.',
        );
      }
      tsconfigPath = detected;
    } else {
      // Fallback to CWD-based detection
      const tsconfigResult = resolveTsConfig(process.cwd());
      if (!tsconfigResult.exists) {
        throw new Error(
          'No tsconfig.json found. Please run this command from a TypeScript project root or a subdirectory of one.',
        );
      }
      tsconfigPath = tsconfigResult.path;
    }

    // Check if we need to reinitialize with a different tsconfig or entry point
    if (this.engine) {
      const currentTsconfig = this.engine.getTsconfigPath();
      if (currentTsconfig === tsconfigPath) {
        // Same tsconfig, no need to reinitialize
        return;
      }

      // Different tsconfig - cleanup and reinitialize
      this.engine.cleanup();
      this.engine = undefined;
      this.symbolIndex = undefined;
    }

    // Create and initialize engine with detected tsconfig
    // If fullProject mode, analyze entire project. Otherwise use forFile as targeted entrypoint.
    let entryPoints: string[] | undefined;
    if (forFile && !options?.fullProject) {
      // Targeted mode: analyze specific file
      entryPoints = [forFile];
    } else if (options?.fullProject) {
      // Full project mode: analyze all files in tsconfig directory
      // TypeDoc needs at least one entry point to start discovery with entryPointStrategy: 'expand'
      const tsconfigDir = tsconfigPath.replace(/\/tsconfig\.json$/, '');
      entryPoints = [tsconfigDir];
    }
    // else: undefined, TypeDoc will use tsconfig includes (might not work in all setups)

    this.engine = new TypeDocEngine({
      tsconfig: tsconfigPath,
      entryPoints,
    });

    await this.engine.initialize();
    await this.engine.convertProject();

    // Build symbol index
    const symbols = this.engine.getSymbols();
    this.symbolIndex = new SymbolIndex();
    this.symbolIndex.addMany(symbols);
  }
}
