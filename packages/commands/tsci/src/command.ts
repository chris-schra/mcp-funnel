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

/* eslint-disable max-lines */
// TODO: Consider extracting CLI handlers to separate file if file grows beyond 700 lines

import { resolve, normalize } from 'node:path';
import { readFileSync } from 'node:fs';
import type { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import { ReflectionKind, type DeclarationReflection } from 'typedoc';
import { TypeDocEngine } from './core/engine.js';
import { SymbolIndex } from './core/symbolIndex.js';
import { DescribeFileFormatter, DescribeSymbolFormatter } from './formatters/index.js';
import { YAMLDescribeFileFormatter } from './formatters/yamlDescribeFileFormatter.js';
import { DiagramGenerator } from './services/diagramGenerator.js';
import { resolveTsConfig } from './util/tsconfig.js';
import { findNearestTsconfig } from './util/findNearestTsconfig.js';
import { generateReceiptToken } from './util/receiptToken.js';
import {
  validateFilePath,
  validateSymbolId,
  validateVerbosity,
  validateFileArray,
} from './util/validation.js';
import { createErrorResponse, createTextResponse } from './util/responses.js';
import type { VerbosityLevel } from './formatters/types.js';

/**
 * Parsed CLI arguments structure
 */
interface ParsedCliArgs {
  positional: string[];
  flags: Map<string, string>;
}

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
   * Returns MCP tool definitions for read_file, describe_symbol, and understand_context.
   *
   * Provides tool schemas that describe parameters, types, and requirements
   * for the MCP protocol integration.
   * @returns Array of tool definitions with input schemas
   */
  public getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'read_file',
        description:
          'Read a file with automatic structure optimization. Small files (<300 lines) return full content. Large files (≥300 lines) return YAML structure with receiptToken for deferred reading.',
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
          'Get detailed information about a specific symbol by ID (from read_file YAML structure)',
        inputSchema: {
          type: 'object',
          properties: {
            symbolId: {
              type: 'string',
              description: 'Symbol ID from read_file YAML structure',
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
      // Route to appropriate handler
      // Each handler manages engine initialization as needed
      switch (toolName) {
        case 'read_file':
          return await this.handleDescribeFile(args);

        case 'describe_symbol':
          // Ensure engine is initialized (uses last tsconfig)
          await this.ensureEngine();
          return await this.handleDescribeSymbol(args);

        case 'understand_context':
          // Ensure engine is initialized (uses last tsconfig)
          await this.ensureEngine();
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
      this.showCliHelp();
      process.exit(subcommand ? 0 : 1);
    }

    try {
      // Each command handler manages engine initialization as needed
      switch (subcommand) {
        case 'describe-file':
          await this.cliDescribeFile(args.slice(1));
          break;

        case 'describe-symbol':
          // Ensure engine is initialized (uses last tsconfig or CWD)
          await this.ensureEngine();
          await this.cliDescribeSymbol(args.slice(1));
          break;

        case 'understand-context':
          // Ensure engine is initialized (uses last tsconfig or CWD)
          await this.ensureEngine();
          await this.cliUnderstandContext(args.slice(1));
          break;

        default:
          console.error(`Error: Unknown command: ${subcommand}`);
          console.error('');
          this.showCliHelp();
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * Shows CLI help information.
   * Displays usage, available commands, and examples.
   */
  private showCliHelp(): void {
    console.info(`
TypeScript Code Intelligence - AI-optimized codebase exploration

Usage:
  tsci <command> [options]

Commands:
  describe-file <file> [--verbosity <level>]
    Get symbols and type information from a TypeScript file

    Arguments:
      file                    File path relative to project root

    Options:
      --verbosity <level>     Output detail level: minimal | normal | detailed
                              (default: minimal)

    Examples:
      tsci describe-file src/command.ts
      tsci describe-file src/command.ts --verbosity normal
      tsci describe-file src/command.ts --verbosity detailed

  describe-symbol <symbolId> [--verbosity <level>]
    Get detailed information about a specific symbol

    Arguments:
      symbolId                Symbol ID from describe-file output

    Options:
      --verbosity <level>     Output detail level: minimal | normal | detailed
                              (default: minimal)

    Examples:
      tsci describe-symbol "TSCICommand:128:src/command.ts:65"
      tsci describe-symbol "TSCICommand:128:src/command.ts:65" --verbosity detailed

  understand-context <file1> [file2...] [--focus <file>]
    Generate Mermaid diagram showing file relationships

    Arguments:
      file1, file2...         Files to include in diagram (relative to project root)

    Options:
      --focus <file>          File to highlight in the diagram (optional)

    Examples:
      tsci understand-context src/command.ts src/core/engine.ts
      tsci understand-context src/command.ts src/core/engine.ts --focus src/command.ts

  help, --help, -h
    Show this help message
`);
  }

  /**
   * Parses CLI arguments into positional args and flags.
   *
   * Supports both --flag=value and --flag value syntax.
   * @param args - Raw CLI arguments
   * @returns Parsed positional arguments and flags map
   */
  private parseCliArgs(args: string[]): ParsedCliArgs {
    const positional: string[] = [];
    const flags = new Map<string, string>();

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        // Handle --flag=value syntax
        const eqIdx = arg.indexOf('=');
        if (eqIdx > 0) {
          const key = arg.slice(2, eqIdx);
          const value = arg.slice(eqIdx + 1);
          flags.set(key, value);
        } else {
          // Handle --flag value syntax
          const key = arg.slice(2);
          if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
            flags.set(key, args[++i]);
          } else {
            // Flag without value
            flags.set(key, 'true');
          }
        }
      } else {
        positional.push(arg);
      }
    }

    return { positional, flags };
  }

  /**
   * Handles describe-file CLI command.
   *
   * Parses arguments, calls handleDescribeFile, and formats output.
   * @param args - CLI arguments after subcommand
   */
  private async cliDescribeFile(args: string[]): Promise<void> {
    const parsed = this.parseCliArgs(args);

    if (parsed.positional.length === 0) {
      console.error('Error: file path is required');
      console.error('');
      console.error('Usage: tsci describe-file <file> [--verbosity <level>]');
      console.error('');
      console.error('Examples:');
      console.error('  tsci describe-file src/command.ts');
      console.error('  tsci describe-file src/command.ts --verbosity normal');
      process.exit(1);
    }

    const file = parsed.positional[0];
    const verbosity = parsed.flags.get('verbosity') || 'minimal';

    // Validate verbosity value
    if (!['minimal', 'normal', 'detailed'].includes(verbosity)) {
      console.error(`Error: Invalid verbosity level: ${verbosity}`);
      console.error('Valid values: minimal, normal, detailed');
      process.exit(1);
    }

    const result = await this.handleDescribeFile({ file, verbosity });

    if (result.isError) {
      console.error(result.content[0].text);
      this.engine?.cleanup();
      process.exit(1);
    }

    // Print main response
    console.info(result.content[0].text);

    // Print hint if present
    if (result.content.length > 1) {
      console.info('');
      console.info('Hint:', result.content[1].text);
    }

    // Cleanup and exit successfully
    this.engine?.cleanup();
    process.exit(0);
  }

  /**
   * Handles describe-symbol CLI command.
   *
   * Parses arguments, calls handleDescribeSymbol, and formats output.
   * @param args - CLI arguments after subcommand
   */
  private async cliDescribeSymbol(args: string[]): Promise<void> {
    const parsed = this.parseCliArgs(args);

    if (parsed.positional.length === 0) {
      console.error('Error: symbolId is required');
      console.error('');
      console.error('Usage: tsci describe-symbol <symbolId> [--verbosity <level>]');
      console.error('');
      console.error('Examples:');
      console.error('  tsci describe-symbol "TSCICommand:128:src/command.ts:65"');
      console.error(
        '  tsci describe-symbol "TSCICommand:128:src/command.ts:65" --verbosity detailed',
      );
      process.exit(1);
    }

    const symbolId = parsed.positional[0];
    const verbosity = parsed.flags.get('verbosity') || 'minimal';

    // Validate verbosity value
    if (!['minimal', 'normal', 'detailed'].includes(verbosity)) {
      console.error(`Error: Invalid verbosity level: ${verbosity}`);
      console.error('Valid values: minimal, normal, detailed');
      process.exit(1);
    }

    const result = await this.handleDescribeSymbol({ symbolId, verbosity });

    if (result.isError) {
      console.error(result.content[0].text);
      this.engine?.cleanup();
      process.exit(1);
    }

    // Print main response
    console.info(result.content[0].text);

    // Print hint if present
    if (result.content.length > 1) {
      console.info('');
      console.info('Hint:', result.content[1].text);
    }

    // Cleanup and exit successfully
    this.engine?.cleanup();
    process.exit(0);
  }

  /**
   * Handles understand-context CLI command.
   *
   * Parses arguments, calls handleUnderstandContext, and formats output.
   * @param args - CLI arguments after subcommand
   */
  private async cliUnderstandContext(args: string[]): Promise<void> {
    const parsed = this.parseCliArgs(args);

    if (parsed.positional.length === 0) {
      console.error('Error: at least one file path is required');
      console.error('');
      console.error('Usage: tsci understand-context <file1> [file2...] [--focus <file>]');
      console.error('');
      console.error('Examples:');
      console.error('  tsci understand-context src/command.ts src/core/engine.ts');
      console.error(
        '  tsci understand-context src/command.ts src/core/engine.ts --focus src/command.ts',
      );
      process.exit(1);
    }

    const files = parsed.positional;
    const focus = parsed.flags.get('focus');

    const requestArgs: Record<string, unknown> = { files };
    if (focus) {
      requestArgs.focus = focus;
    }

    const result = await this.handleUnderstandContext(requestArgs);

    if (result.isError) {
      console.error(result.content[0].text);
      this.engine?.cleanup();
      process.exit(1);
    }

    // For understand-context, output the Mermaid diagram directly (no JSON wrapping)
    console.info(result.content[0].text);

    // Print hint if present
    if (result.content.length > 1) {
      console.info('');
      console.info('Hint:', result.content[1].text);
    }

    // Cleanup and exit successfully
    this.engine?.cleanup();
    process.exit(0);
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
   * @param forFile - Optional file path to detect nearest tsconfig.json for (also used as entry point)
   * @throws Error if tsconfig.json cannot be found or initialization fails
   */
  private async ensureEngine(forFile?: string): Promise<void> {
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
      const currentTsconfig = (this.engine as any).options?.tsconfig;
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
    // If a file is specified, use it as the entry point for TypeDoc analysis
    this.engine = new TypeDocEngine({
      tsconfig: tsconfigPath,
      entryPoints: forFile ? [forFile] : undefined,
    });

    await this.engine.initialize();
    await this.engine.convertProject();

    // Build symbol index
    const symbols = this.engine.getSymbols();
    this.symbolIndex = new SymbolIndex();
    this.symbolIndex.addMany(symbols);
  }

  /**
   * Handles read_file tool execution.
   *
   * For small files (<300 lines): Returns full content with strategy='full'
   * For large files (≥300 lines): Returns YAML structure with receiptToken for deferred reading
   *
   * @param args - Tool arguments (file, verbosity)
   * @returns CallToolResult with file content or YAML structure
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

    // Normalize to absolute path
    const absolutePath = resolve(process.cwd(), fileValidation.value);

    // Read file content to determine strategy
    let content: string;
    try {
      content = readFileSync(absolutePath, 'utf-8');
    } catch (error) {
      return createErrorResponse(
        `Failed to read file: ${fileValidation.value}. ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const lines = content.split('\n').length;
    const tokenEstimate = lines * 5;

    // Small file: return full content as YAML
    if (lines < 300) {
      const { stringify: yamlStringify } = await import('yaml');
      const response = {
        strategy: 'full',
        file: absolutePath,
        lines,
        tokenEstimate,
        content,
      };

      return createTextResponse(yamlStringify(response, { lineWidth: 0 }));
    }

    // Large file: return YAML structure with receiptToken
    // Ensure engine is initialized with the correct tsconfig for this file
    await this.ensureEngine(absolutePath);

    // Get DeclarationReflection objects from project for this file
    const project = this.engine!.getProject();
    if (!project) {
      return createErrorResponse('TypeDoc project not available. Engine initialization failed.');
    }

    // Query only top-level declarations (not their child signatures/members)
    // Children are still accessible via reflection.children for member extraction
    const topLevelKinds =
      ReflectionKind.Function |
      ReflectionKind.Class |
      ReflectionKind.Interface |
      ReflectionKind.TypeAlias |
      ReflectionKind.Enum |
      ReflectionKind.Variable |
      ReflectionKind.Namespace;

    const allReflections = project.getReflectionsByKind(topLevelKinds) as DeclarationReflection[];
    const fileReflections = allReflections.filter((reflection) => {
      const sourceFile = reflection.sources?.[0];
      const filePath = sourceFile?.fullFileName || sourceFile?.fileName;
      return filePath && normalize(filePath) === absolutePath;
    });

    if (fileReflections.length === 0) {
      return createErrorResponse(
        `No symbols found in file: ${fileValidation.value}. ` +
          `File may not exist or may not be part of the TypeScript project.`,
      );
    }

    // Format reflections as YAML
    const yamlFormatter = new YAMLDescribeFileFormatter();
    const yaml = yamlFormatter.format(fileReflections);

    // Generate receiptToken
    const token = generateReceiptToken(absolutePath);

    // Build complete YAML response with metadata
    // Parse the symbols YAML, add metadata fields, re-serialize as complete YAML
    const { parse: yamlParse, stringify: yamlStringify } = await import('yaml');
    const symbolsData = yamlParse(yaml);

    const completeResponse = {
      strategy: 'structure_only',
      file: absolutePath,
      receiptToken: token,
      lines,
      tokenEstimate,
      hint: `File has ${lines} lines. Use Read tool with receiptToken for full content, or read specific line ranges`,
      ...symbolsData,  // Merge in symbols array
    };

    return createTextResponse(yamlStringify(completeResponse, { lineWidth: 0 }));
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
          `Use read_file to get valid symbol IDs from YAML structure.`,
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
