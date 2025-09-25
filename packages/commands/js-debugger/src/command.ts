import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import chalk from 'chalk';
import { SessionManager } from './session-manager.js';
import { MockSessionManager } from './adapters/mock-session-manager.js';
import { DebugResponseFormatter } from './formatters/debug-response-formatter.js';
import { SessionValidator } from './sessions/session-validator.js';
import type {
  IToolHandler,
  ToolHandlerContext,
  IResponseFormatter,
  ISessionValidator,
  IMockSessionManager,
  ISessionManager,
} from './types.js';

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
} from './handlers/index.js';

/**
 * Refactored js-debugger command - thin orchestrator following SEAMS architecture
 *
 * This class is now a thin orchestrator that delegates to specialized handlers,
 * eliminating the 800+ line monolithic command class and applying SEAMS and DRY principles.
 *
 * SEAMS (extension points):
 * - IToolHandler: New MCP tools can be added by implementing this interface
 * - IResponseFormatter: Different response formats can be plugged in
 * - ISessionValidator: Session validation logic can be customized
 * - IMockSessionManager: Mock behavior can be modified or extended
 *
 * DRY eliminations:
 * - JSON response formatting consolidated in DebugResponseFormatter
 * - Session validation logic consolidated in SessionValidator
 * - Mock session logic separated into MockSessionManager
 * - Common error handling patterns shared across handlers
 */
export class JsDebuggerCommand implements ICommand {
  readonly name = 'js-debugger';
  readonly description = 'Debug JavaScript in Node.js or browser environments';

  private sessionManager: ISessionManager;
  private mockSessionManager: IMockSessionManager;
  private responseFormatter: IResponseFormatter;
  private sessionValidator: ISessionValidator;
  private handlers: Map<string, IToolHandler<Record<string, unknown>>>;

  constructor() {
    // Initialize core services
    this.sessionManager = SessionManager.getInstance();
    this.mockSessionManager = new MockSessionManager();
    this.responseFormatter = new DebugResponseFormatter();
    this.sessionValidator = new SessionValidator(
      this.sessionManager,
      this.mockSessionManager,
    );

    // Initialize handler registry
    this.handlers = new Map();
    this.registerHandlers();
  }

  /**
   * Register all tool handlers - SEAM for extensibility
   * New tools can be added here without modifying existing code
   */
  private registerHandlers(): void {
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
            stopOnEntry: { type: 'boolean', default: false },
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
              description:
                'Dot-notation path to specific variable (e.g., "user.profile.settings")',
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
          required: ['sessionId'],
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

  /**
   * Execute MCP tool via thin orchestration - no more 800+ line switch statement!
   * This method now simply delegates to the appropriate handler
   */
  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const handler = this.handlers.get(toolName);

    if (!handler) {
      return this.responseFormatter.error(`Unknown tool: ${toolName}`, {
        availableTools: Array.from(this.handlers.keys()),
      });
    }

    // Create shared context for all handlers - eliminates DRY violations
    const context: ToolHandlerContext = {
      sessionManager: this.sessionManager,
      responseFormatter: this.responseFormatter,
      sessionValidator: this.sessionValidator,
      mockSessionManager: this.mockSessionManager,
    };

    try {
      return await handler.handle(args, context);
    } catch (error) {
      // Centralized error handling
      return this.responseFormatter.error(
        error instanceof Error ? error.message : 'Unknown error',
        {
          tool: toolName,
          args,
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
    }
  }

  /**
   * CLI execution - preserved for compatibility
   */
  async executeViaCLI(_args: string[]): Promise<void> {
    const USE_REAL_CDP = process.env.JS_DEBUGGER_REAL !== 'false';

    console.info(chalk.blue.bold('\nJavaScript Debugger'));
    console.info(
      chalk.yellow('Interactive debugging for Node.js and browsers'),
    );
    console.info('\nFeatures:');
    console.info('  - Chrome DevTools Protocol (CDP) integration');
    console.info('  - Node.js inspector support');
    console.info('  - Browser debugging via remote debugging port');
    console.info('  - Breakpoints with conditions');
    console.info('  - Step debugging (over, into, out)');
    console.info('  - Expression evaluation');
    console.info('  - Console output capture');
    console.info('  - Sophisticated variable inspection');
    console.info('  - Session lifecycle management with auto-cleanup');
    console.info('\nArchitecture:');
    console.info('  - Modular handler-based design (SEAMS)');
    console.info('  - DRY-compliant with shared utilities');
    console.info('  - Separated mock and real implementations');
    console.info('  - Comprehensive session management');
    console.info('\nUse via MCP for interactive debugging');
    console.info(
      `\nMode: ${USE_REAL_CDP ? 'Real CDP' : 'Mock'} (set JS_DEBUGGER_REAL=true/false to switch)`,
    );
    console.info(
      `\nActive handlers: ${Array.from(this.handlers.keys()).join(', ')}`,
    );
  }
}
