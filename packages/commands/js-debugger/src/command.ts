import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import chalk from 'chalk';
import { SessionManager } from './session-manager.js';
import { MockSessionManager } from './adapters/mock-session-manager.js';
import { DebugResponseFormatter } from './formatters/debug-response-formatter.js';
import { SessionValidator } from './sessions/session-validator.js';
import { JS_DEBUGGER_TOOLS } from './tool-definitions.js';
import type {
  IToolHandler,
  ToolHandlerContext,
  IResponseFormatter,
  ISessionValidator,
  IMockSessionManager,
  ISessionManager,
} from './types/index.js';

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
  public readonly name = 'js-debugger';
  public readonly description =
    'Debug JavaScript in Node.js or browser environments';

  private sessionManager: ISessionManager;
  private mockSessionManager: IMockSessionManager;
  private responseFormatter: IResponseFormatter;
  private sessionValidator: ISessionValidator;
  private handlers: Map<string, IToolHandler<Record<string, unknown>>>;

  public constructor() {
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
  public getMCPDefinitions(): Tool[] {
    return JS_DEBUGGER_TOOLS;
  }

  /**
   * Execute MCP tool via thin orchestration - no more 800+ line switch statement!
   * This method now simply delegates to the appropriate handler
   */
  public async executeToolViaMCP(
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
  public async executeViaCLI(_args: string[]): Promise<void> {
    console.info(chalk.blue.bold('\nJavaScript Debugger'));
    console.info(
      chalk.yellow('Interactive debugging for Node.js and browsers'),
    );
  }
}
