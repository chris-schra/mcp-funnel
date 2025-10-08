import type { CallToolResult, Tool } from '@mcp-funnel/commands-core';
import { BaseCommand } from '@mcp-funnel/commands-core';

import type { VitestSessionConfig } from './types/index.js';
import {
  parseStartSessionArgs,
  parseConsoleQueryArgs,
  parseResultQueryArgs,
  parseSessionStatusArgs,
} from './util/parsers.js';
import {
  createStartSessionSchema,
  createConsoleQuerySchema,
  createResultQuerySchema,
  createSessionStatusSchema,
} from './util/schemas.js';
import { VitestSessionManager } from './session/index.js';

/**
 * Vitest runner command for MCP Funnel.
 *
 * Provides comprehensive Vitest test running capabilities with AI-optimized output,
 * including test execution, result querying, console output filtering, and session management.
 *
 * Supports both MCP protocol tool calls and CLI execution with proper error handling
 * and resource management.
 */
export class VitestCommand extends BaseCommand {
  public readonly name = 'vitest';
  public readonly description = 'Run vitest tests and query results with AI-optimized output';
  private readonly manager: VitestSessionManager = new VitestSessionManager();

  /**
   * Returns MCP tool definitions with proper command prefixing
   *
   * @returns Array of tool definitions
   */
  public getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'startSession',
        description:
          'Start a vitest test session. Returns sessionId and summary stats. ' +
          'Use vitest_getResults to query detailed test results.',
        inputSchema: createStartSessionSchema(),
      },
      {
        name: 'getResults',
        description:
          'Query test results. Returns summary only by default. Specify testFile or testName (supports globs) to get detailed results showing all test statuses. Returns failed tests only when no filters specified.',
        inputSchema: createResultQuerySchema(),
      },
      {
        name: 'queryConsole',
        description:
          'Search and filter console output from test session. ' +
          'Supports filtering by test, stream type, and text search with regex.',
        inputSchema: createConsoleQuerySchema(),
      },
      {
        name: 'getSessionStatus',
        description:
          'Get current status of a test session including run state and summary statistics.',
        inputSchema: createSessionStatusSchema(),
      },
    ];
  }

  /**
   * Executes tool via MCP protocol with proper tool name mapping
   *
   * @param toolName - Name of the tool to execute
   * @param args - Tool arguments
   * @returns Tool execution result
   */
  public async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      // Remove command prefix for internal handling
      const internalToolName = toolName.replace('vitest_', '');

      switch (internalToolName) {
        case 'startSession':
          return await this.handleStartSession(args);
        case 'getResults':
          return await this.handleGetResults(args);
        case 'queryConsole':
          return await this.handleQueryConsole(args);
        case 'getSessionStatus':
          return await this.handleGetSessionStatus(args);
        default:
          return errorResponse(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Executes command via CLI interface with help system
   *
   * @param args - Command line arguments
   * @returns Promise that resolves when execution completes
   */
  public async executeViaCLI(args: string[]): Promise<void> {
    const [subcommand, ...subArgs] = args;

    switch (subcommand) {
      case 'start':
        return this.handleStartSessionCLI(subArgs);
      case 'help':
      case '--help':
      case '-h':
        this.showHelp();
        break;
      default:
        if (!subcommand) {
          this.showHelp();
        } else {
          throw new Error(`Unknown subcommand: ${subcommand}`);
        }
    }
  }

  /**
   * Shows help information for CLI usage
   */
  private showHelp(): void {
    this.log(`
Vitest Runner Command - MCP Funnel

Usage:
  npx mcp-funnel run ${this.name} <subcommand> [options]

Subcommands:
  start [pattern]             Start a test session (default: run all tests)
  help                        Show this help message

Examples:
  npx mcp-funnel run ${this.name} start
  npx mcp-funnel run ${this.name} start "**/*.test.ts"

Note: Full test querying capabilities are available through the MCP protocol tools:
  - vitest_startSession
  - vitest_getResults
  - vitest_queryConsole
  - vitest_getSessionStatus
    `);
  }

  /**
   * Handles CLI start session command
   *
   * @param args - CLI arguments
   */
  private async handleStartSessionCLI(args: string[]): Promise<void> {
    const config: VitestSessionConfig = {};

    if (args.length > 0) {
      config.testPattern = args[0];
    }

    try {
      const response = await this.manager.startSession(config);
      this.log('Test session started:');
      this.log(`  Session ID: ${response.sessionId}`);
      this.log(`  Status: ${response.status}`);
      if (response.summary) {
        this.log(`  Total: ${response.summary.total}`);
        this.log(`  Passed: ${response.summary.passed}`);
        this.log(`  Failed: ${response.summary.failed}`);
        this.log(`  Skipped: ${response.summary.skipped}`);
      }
      if (response.message) {
        this.log(`  ${response.message}`);
      }
    } catch (error) {
      throw new Error(`Failed to start test session: ${error}`);
    }
  }

  /**
   * Handles start session requests
   *
   * @param args - Request arguments
   * @returns Session start response
   */
  private async handleStartSession(args: Record<string, unknown>): Promise<CallToolResult> {
    const config = parseStartSessionArgs(args);
    const response = await this.manager.startSession(config);
    return jsonResponse(response);
  }

  /**
   * Handles get results requests
   *
   * @param args - Request arguments
   * @returns Test results response
   */
  private async handleGetResults(args: Record<string, unknown>): Promise<CallToolResult> {
    const query = parseResultQueryArgs(args);
    const result = this.manager.getResults(query);
    return jsonResponse(result);
  }

  /**
   * Handles console query requests
   *
   * @param args - Request arguments
   * @returns Console query response
   */
  private async handleQueryConsole(args: Record<string, unknown>): Promise<CallToolResult> {
    const query = parseConsoleQueryArgs(args);
    const result = this.manager.queryConsole(query);
    return jsonResponse(result);
  }

  /**
   * Handles session status requests
   *
   * @param args - Request arguments
   * @returns Session status response
   */
  private async handleGetSessionStatus(args: Record<string, unknown>): Promise<CallToolResult> {
    const sessionId = parseSessionStatusArgs(args);
    const result = this.manager.getSessionStatus(sessionId);
    return jsonResponse(result);
  }
}

/**
 * Creates a JSON response for successful operations
 *
 * @param value - Response value to serialize
 * @returns Formatted tool result
 */
function jsonResponse(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

/**
 * Creates an error response for failed operations
 *
 * @param message - Error message
 * @returns Formatted error tool result
 */
function errorResponse(message: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    isError: true,
  };
}

// Export default instance for MCP Funnel discovery
export default new VitestCommand();
