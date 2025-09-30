import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import chalk from 'chalk';
import { SessionManager } from './session-manager.js';
import { MockSessionManager } from './adapters/mock-session-manager.js';
import { DebugResponseFormatter } from './formatters/debug-response-formatter.js';
import { SessionValidator } from './sessions/session-validator.js';
import { ToolRegistration } from './command/tool-registration.js';
import type {
  ToolHandlerContext,
  IResponseFormatter,
  ISessionValidator,
  IMockSessionManager,
  ISessionManager,
} from './types/index.js';

/**
 * JavaScript debugger command supporting Node.js and browser debugging via Chrome DevTools Protocol.
 *
 * A thin orchestrator that delegates debugging operations to specialized handlers.
 * This architecture eliminates the previous 800+ line monolithic implementation
 * by applying SEAMS principles for extensibility and DRY for maintainability.
 *
 * The command manages debug sessions through a session manager singleton and routes
 * tool invocations to appropriate handlers based on the tool name. It supports both
 * mock mode (for testing) and real CDP connections (for actual debugging).
 *
 * Architecture highlights:
 * - Handler-based design: Each debug operation (debug, continue, get_stacktrace, etc.)
 *   has its own handler implementing IToolHandler
 * - Centralized formatting: All MCP responses go through DebugResponseFormatter
 * - Session lifecycle: SessionManager tracks active/terminated sessions with auto-cleanup
 * - Mock support: MockSessionManager provides test doubles without real process spawning
 *
 * Extension points (SEAMS):
 * - IToolHandler: Add new debug operations by implementing this interface
 * - IResponseFormatter: Customize MCP response formatting
 * - ISessionValidator: Extend session validation rules
 * - IMockSessionManager: Modify mock behavior for testing
 * @example Basic usage through MCP
 * ```typescript
 * const command = new JsDebuggerCommand();
 *
 * // Start a debug session
 * const result = await command.executeToolViaMCP('debug', {
 *   platform: 'node',
 *   target: './script.js',
 *   breakpoints: [{ file: './script.js', line: 10 }]
 * });
 *
 * // Get available tools
 * const tools = command.getMCPDefinitions();
 * ```
 * @example Mock mode for testing
 * ```typescript
 * const result = await command.executeToolViaMCP('debug', {
 *   platform: 'node',
 *   target: './script.js',
 *   useMock: true  // Uses MockSessionManager instead of real CDP
 * });
 * ```
 * @public
 * @see file:./session-manager.ts - Session lifecycle management
 * @see file:./command/tool-registration.ts - Handler registration and MCP definitions
 * @see file:./adapters/mock-session-manager.ts - Mock implementation for testing
 */
export class JsDebuggerCommand implements ICommand {
  public readonly name = 'js-debugger';
  public readonly description =
    'Debug JavaScript in Node.js or browser environments';

  private sessionManager: ISessionManager;
  private mockSessionManager: IMockSessionManager;
  private responseFormatter: IResponseFormatter;
  private sessionValidator: ISessionValidator;
  private toolRegistration: ToolRegistration;

  public constructor() {
    // Initialize core services
    this.sessionManager = SessionManager.getInstance();
    this.mockSessionManager = new MockSessionManager();
    this.responseFormatter = new DebugResponseFormatter();
    this.sessionValidator = new SessionValidator(
      this.sessionManager,
      this.mockSessionManager,
    );

    // Initialize tool registration
    this.toolRegistration = new ToolRegistration();
  }

  /**
   * Returns MCP tool definitions for all registered debug operations.
   *
   * Delegates to ToolRegistration which maintains the centralized registry
   * of handlers and their corresponding MCP tool schemas. Each tool definition
   * includes the tool name, description, and input schema for MCP protocol.
   * @returns Array of MCP Tool definitions with schemas for debug, continue, get_stacktrace,
   *          get_variables, search_console_output, list_sessions, stop, and cleanup_sessions
   * @see file:./command/tool-registration.ts:110 - Tool definition generation
   */
  public getMCPDefinitions(): Tool[] {
    return this.toolRegistration.getMCPDefinitions();
  }

  /**
   * Executes a debug tool by routing to the appropriate handler.
   *
   * This is the main entry point for MCP tool invocations. It performs lookup
   * in the handler registry, constructs a shared context with all necessary
   * dependencies, and delegates execution to the matched handler. Errors from
   * handlers are caught and formatted into MCP-compliant error responses.
   * @param toolName - Name of the debug tool (e.g., 'debug', 'continue', 'get_stacktrace')
   * @param args - Tool-specific arguments as a JSON object (structure varies per tool)
   * @returns MCP-compliant result with text content containing JSON response
   * @throws Never throws - all errors are caught and returned as formatted error responses
   * @example Starting a debug session
   * ```typescript
   * const result = await command.executeToolViaMCP('debug', {
   *   platform: 'node',
   *   target: './app.js',
   *   breakpoints: [{ file: './app.js', line: 42 }]
   * });
   * ```
   * @example Handling unknown tool
   * ```typescript
   * const result = await command.executeToolViaMCP('invalid_tool', {});
   * // Returns error response with list of available tools
   * ```
   * @see file:./types/handlers.ts:22 - ToolHandlerContext interface
   * @see file:./command/tool-registration.ts:44 - Handler lookup implementation
   */
  public async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const handler = this.toolRegistration.getHandler(toolName);

    if (!handler) {
      return this.responseFormatter.error(`Unknown tool: ${toolName}`, {
        availableTools: this.toolRegistration.getAvailableTools(),
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
   * Displays debug command capabilities and architecture information.
   *
   * This method provides a CLI information view showing the debugger's features,
   * architecture highlights, and current configuration. It does not start an
   * interactive debugging session - actual debugging is done through MCP tool invocations.
   *
   * The method checks the JS_DEBUGGER_REAL environment variable to display whether
   * the command is operating in real CDP mode or mock mode.
   *
   * This is primarily an informational method. Interactive debugging happens
   * through the MCP protocol via executeToolViaMCP, not through CLI execution.
   *
   * Environment variables:
   * - JS_DEBUGGER_REAL: Set to 'false' to use mock mode, any other value uses real CDP
   * @param _args - Command line arguments (currently unused, reserved for future CLI options)
   */
  public async executeViaCLI(_args: string[]): Promise<void> {
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
      `\nActive handlers: ${this.toolRegistration.getAvailableTools().join(', ')}`,
    );
  }
}
