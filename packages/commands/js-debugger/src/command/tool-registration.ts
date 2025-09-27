import { Tool } from '@mcp-funnel/commands-core';
import type { IToolHandler } from '../types/index.js';

// Import all handlers
import {
  DebugHandler,
  ContinueHandler,
  ListSessionsHandler,
  StopHandler,
  GetStacktraceHandler,
  GetVariablesHandler,
  SearchConsoleOutputHandler,
  CleanupSessionsHandler,
} from '../handlers/index.js';

/**
 * Tool registration manager for the js-debugger command
 *
 * Provides SEAM for extensibility:
 * - New tools can be added by implementing IToolHandler interface
 * - MCP definitions are co-located with handler registration
 * - Type-safe handler mapping with runtime polymorphism
 *
 * This eliminates the large tool definition arrays from the main command class
 */
export class ToolRegistration {
  private handlers = new Map<string, IToolHandler<Record<string, unknown>>>();

  constructor() {
    this.registerAllHandlers();
  }

  /**
   * Get all registered tool handlers
   */
  getHandlers(): Map<string, IToolHandler<Record<string, unknown>>> {
    return this.handlers;
  }

  /**
   * Get a specific handler by tool name
   */
  getHandler(
    toolName: string,
  ): IToolHandler<Record<string, unknown>> | undefined {
    return this.handlers.get(toolName);
  }

  /**
   * Get list of available tool names
   */
  getAvailableTools(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Register all tool handlers - SEAM for extensibility
   * New tools can be added here without modifying existing code
   */
  private registerAllHandlers(): void {
    // Store handlers with type erasure for runtime polymorphism
    this.handlers.set(
      'debug',
      new DebugHandler() as unknown as IToolHandler<Record<string, unknown>>,
    );
    this.handlers.set(
      'continue',
      new ContinueHandler() as unknown as IToolHandler<Record<string, unknown>>,
    );
    this.handlers.set(
      'list_sessions',
      new ListSessionsHandler() as unknown as IToolHandler<
        Record<string, unknown>
      >,
    );
    this.handlers.set(
      'stop',
      new StopHandler() as unknown as IToolHandler<Record<string, unknown>>,
    );
    this.handlers.set(
      'get_stacktrace',
      new GetStacktraceHandler() as unknown as IToolHandler<
        Record<string, unknown>
      >,
    );
    this.handlers.set(
      'get_variables',
      new GetVariablesHandler() as unknown as IToolHandler<
        Record<string, unknown>
      >,
    );
    this.handlers.set(
      'search_console_output',
      new SearchConsoleOutputHandler() as unknown as IToolHandler<
        Record<string, unknown>
      >,
    );
    this.handlers.set(
      'cleanup_sessions',
      new CleanupSessionsHandler() as unknown as IToolHandler<
        Record<string, unknown>
      >,
    );
  }

  /**
   * Get MCP tool definitions - consolidated from handler definitions
   */
  getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'debug',
        description: 'Start a debug session and pause at first breakpoint',
        inputSchema: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['node', 'browser'],
              description: 'Debugging platform (node or browser)',
            },
            target: {
              type: 'string',
              description:
                'Script path for Node or URL/connection mode for browser',
            },
            command: {
              type: 'string',
              description:
                'Runtime command for Node (e.g., "node", "tsx", "ts-node"). Defaults to "node"',
              default: 'node',
            },
            args: {
              type: 'array',
              description:
                'Additional CLI arguments passed to the script. Use this instead of embedding arguments in the target path.',
              items: {
                type: 'string',
              },
            },
            breakpoints: {
              type: 'array',
              description: 'Breakpoints to set',
              items: {
                type: 'object',
                properties: {
                  file: { type: 'string', description: 'File path' },
                  line: {
                    type: 'number',
                    description: 'Line number (1-based)',
                  },
                  condition: {
                    type: 'string',
                    description: 'Optional condition',
                  },
                },
                required: ['file', 'line'],
              },
            },
            timeout: { type: 'number', default: 30000 },
            evalExpressions: { type: 'array', items: { type: 'string' } },
            captureConsole: {
              type: 'boolean',
              description: 'Capture console output during debug session',
              default: true,
            },
            consoleVerbosity: {
              type: 'string',
              enum: ['all', 'warn-error', 'error-only', 'none'],
              description: 'Console output verbosity level',
              default: 'all',
            },
            useMock: {
              type: 'boolean',
              description: 'Use mock implementation instead of real CDP',
              default: false,
            },
          },
          required: ['platform', 'target'],
        },
      },
      {
        name: 'continue',
        description: 'Continue debug session to next breakpoint',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            action: {
              type: 'string',
              enum: ['continue', 'step_over', 'step_into', 'step_out', 'stop'],
              default: 'continue',
            },
            evaluate: { type: 'string', description: 'Expression to evaluate' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'list_sessions',
        description: 'List active debug sessions',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'stop',
        description: 'Stop and terminate a debug session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'get_stacktrace',
        description: 'Get current stack trace when session is paused',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'get_variables',
        description:
          'Get variables from current debug context with sophisticated inspection',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            path: {
              type: 'string',
              minLength: 1,
              description:
                'Dot-notation path to a specific variable (e.g., "user.profile")',
            },
            frameId: {
              type: 'number',
              description:
                'Specific stack frame to inspect (defaults to top frame)',
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum depth to traverse objects (defaults to 3)',
              default: 3,
            },
          },
          required: ['sessionId', 'path'],
        },
      },
      {
        name: 'search_console_output',
        description: 'Search and filter console output from a debug session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            levels: {
              type: 'object',
              description:
                'Log levels to include (defaults to warn and error only)',
              properties: {
                log: { type: 'boolean' },
                debug: { type: 'boolean' },
                info: { type: 'boolean' },
                warn: { type: 'boolean' },
                error: { type: 'boolean' },
                trace: { type: 'boolean' },
              },
              default: { warn: true, error: true },
            },
            search: {
              type: 'string',
              description: 'Optional search string to filter messages',
            },
            since: {
              type: 'number',
              description: 'Return output since this index (0-based)',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'cleanup_sessions',
        description:
          'Manually trigger cleanup of inactive sessions and get cleanup status',
        inputSchema: {
          type: 'object',
          properties: {
            force: {
              type: 'boolean',
              description:
                'Force cleanup of all inactive sessions regardless of thresholds',
              default: false,
            },
            dryRun: {
              type: 'boolean',
              description:
                'Show what would be cleaned up without actually cleaning',
              default: false,
            },
          },
        },
      },
    ];
  }
}
