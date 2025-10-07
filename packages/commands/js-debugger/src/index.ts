import type { CallToolResult, Tool } from '@mcp-funnel/commands-core';
import { BaseCommand } from '@mcp-funnel/commands-core';

import type { DebuggerCommand } from './types/index.js';
import { DebuggerSessionManager } from './debugger/session-manager.js';
import {
  parseDebugSessionConfig,
  parseDebuggerCommand,
  parseScopeQuery,
  parseOutputQuery,
} from './util/parsers.js';
import {
  createBreakpointLocationSchema,
  createBreakpointMutationSchema,
  createBreakpointSpecSchema,
  createDebuggerCommandSchema,
  createOutputQuerySchema,
  createScopeQuerySchema,
  createStartSessionSchema,
} from './util/schemas.js';

/**
 * JavaScript debugger command for MCP Funnel.
 *
 * Provides comprehensive Node.js debugging capabilities through Chrome DevTools Protocol,
 * including session management, breakpoint control, scope inspection, and output collection.
 *
 * Supports both MCP protocol tool calls and CLI execution with proper error handling
 * and resource management.
 */
export class JsDebuggerCommand extends BaseCommand {
  public readonly name = 'js-debugger';
  public readonly description = 'Debug JavaScript applications using the Chrome DevTools Protocol.';
  private readonly manager = new DebuggerSessionManager();

  /**
   * Returns MCP tool definitions with proper command prefixing
   * @returns Array of tool definitions
   */
  public getMCPDefinitions(): Tool[] {
    // Create schema definitions
    const breakpointLocationSchema = createBreakpointLocationSchema();
    const breakpointSpecSchema = createBreakpointSpecSchema(breakpointLocationSchema);
    const breakpointMutationSchema = createBreakpointMutationSchema(breakpointSpecSchema);

    return [
      {
        name: 'js-debugger_startDebugSession',
        description: 'Spawn a Node.js target and attach a debugger session.',
        inputSchema: createStartSessionSchema(breakpointSpecSchema),
      },
      {
        name: 'js-debugger_debuggerCommand',
        description: 'Control execution flow for an existing debugger session.',
        inputSchema: createDebuggerCommandSchema(
          breakpointLocationSchema,
          breakpointMutationSchema,
        ),
      },
      {
        name: 'js-debugger_getScopeVariables',
        description: 'Inspect variables within a paused call frame scope.',
        inputSchema: createScopeQuerySchema(),
      },
      {
        name: 'js-debugger_queryOutput',
        description: 'Retrieve buffered stdout, stderr, console, and exception output.',
        inputSchema: createOutputQuerySchema(),
      },
    ];
  }

  /**
   * Executes tool via MCP protocol with proper tool name mapping
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
      const internalToolName = toolName.replace('js-debugger_', '');

      switch (internalToolName) {
        case 'startDebugSession':
          return await this.handleStartSession(args);
        case 'debuggerCommand':
          return await this.handleDebuggerCommand(args);
        case 'getScopeVariables':
          return await this.handleScopeQuery(args);
        case 'queryOutput':
          return await this.handleOutputQuery(args);
        default:
          return errorResponse(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Executes command via CLI interface with help system
   * @param args - Command line arguments
   * @returns Promise that resolves when execution completes
   */
  public async executeViaCLI(args: string[]): Promise<void> {
    const [subcommand, ...subArgs] = args;

    switch (subcommand) {
      case 'start':
        return this.handleStartSessionCLI(subArgs);
      case 'command':
        return this.handleDebuggerCommandCLI(subArgs);
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
JavaScript Debugger Command - MCP Funnel

Usage:
  npx mcp-funnel run ${this.name} <subcommand> [options]

Subcommands:
  start <script>              Start a debugging session for a script
  command <action> <sessionId> Send a debugger command to a session
  help                        Show this help message

Examples:
  npx mcp-funnel run ${this.name} start ./app.js
  npx mcp-funnel run ${this.name} command continue <session-id>

Note: Full debugging capabilities are available through the MCP protocol tools:
  - js-debugger_startDebugSession
  - js-debugger_debuggerCommand
  - js-debugger_getScopeVariables
  - js-debugger_queryOutput
    `);
  }

  /**
   * Handles CLI start session command
   * @param args - CLI arguments
   */
  private async handleStartSessionCLI(args: string[]): Promise<void> {
    if (args.length === 0) {
      throw new Error('Script path is required for start command');
    }

    const config = {
      target: {
        type: 'node' as const,
        entry: args[0],
        entryArguments: args.slice(1),
      },
    };

    try {
      const response = await this.manager.startSession(config);
      this.log('Debug session started:');
      this.log(`  Session ID: ${response.session.id}`);
      this.log(`  Inspector URL: ${response.session.inspector?.url}`);
      if (response.breakpoints) {
        this.log(`  Breakpoints created: ${response.breakpoints.length}`);
      }
    } catch (error) {
      throw new Error(`Failed to start debug session: ${error}`);
    }
  }

  /**
   * Handles CLI debugger command
   * @param args - CLI arguments
   */
  private async handleDebuggerCommandCLI(args: string[]): Promise<void> {
    if (args.length < 2) {
      throw new Error('Action and session ID are required for command subcommand');
    }

    const [action, sessionId] = args;
    // Simple commands that don't require additional parameters
    const simpleActions = ['continue', 'pause', 'stepInto', 'stepOver', 'stepOut'];

    if (!simpleActions.includes(action)) {
      throw new Error(`CLI only supports simple actions: ${simpleActions.join(', ')}`);
    }

    const command = {
      sessionId,
      action: action as DebuggerCommand['action'],
    } as DebuggerCommand;

    try {
      const result = await this.manager.runCommand(command);
      this.log('Command executed successfully:');
      this.log(JSON.stringify(result, null, 2));
    } catch (error) {
      throw new Error(`Failed to execute command: ${error}`);
    }
  }

  /**
   * Handles debug session start requests
   * @param args - Request arguments
   * @returns Session start response
   */
  private async handleStartSession(args: Record<string, unknown>): Promise<CallToolResult> {
    const config = parseDebugSessionConfig(args);
    const response = await this.manager.startSession(config);
    return jsonResponse(response);
  }

  /**
   * Handles debugger command requests
   * @param args - Request arguments
   * @returns Command execution response
   */
  private async handleDebuggerCommand(args: Record<string, unknown>): Promise<CallToolResult> {
    const command = parseDebuggerCommand(args);
    const result = await this.manager.runCommand(command);
    return jsonResponse(result);
  }

  /**
   * Handles scope variable inspection requests
   * @param args - Request arguments
   * @returns Scope variables response
   */
  private async handleScopeQuery(args: Record<string, unknown>): Promise<CallToolResult> {
    const query = parseScopeQuery(args);
    const result = await this.manager.getScopeVariables(query);
    return jsonResponse(result);
  }

  /**
   * Handles output query requests
   * @param args - Request arguments
   * @returns Output query response
   */
  private async handleOutputQuery(args: Record<string, unknown>): Promise<CallToolResult> {
    const query = parseOutputQuery(args);
    const result = await this.manager.queryOutput(query);
    return jsonResponse(result);
  }
}

/**
 * Creates a JSON response for successful operations
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
export default new JsDebuggerCommand();
