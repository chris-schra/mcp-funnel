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
 * - ToolRegistration: Centralized tool registration and MCP definitions
 *
 * DRY eliminations:
 * - JSON response formatting consolidated in DebugResponseFormatter
 * - Session validation logic consolidated in SessionValidator
 * - Mock session logic separated into MockSessionManager
 * - Tool registration logic extracted to ToolRegistration
 * - Common error handling patterns shared across handlers
 */
export class JsDebuggerCommand implements ICommand {
  readonly name = 'js-debugger';
  readonly description = 'Debug JavaScript in Node.js or browser environments';

  private sessionManager: ISessionManager;
  private mockSessionManager: IMockSessionManager;
  private responseFormatter: IResponseFormatter;
  private sessionValidator: ISessionValidator;
  private toolRegistration: ToolRegistration;

  constructor() {
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
   * Get MCP tool definitions from centralized registration
   */
  getMCPDefinitions(): Tool[] {
    return this.toolRegistration.getMCPDefinitions();
  }

  /**
   * Execute MCP tool via thin orchestration - no more 800+ line switch statement!
   * This method now simply delegates to the appropriate handler
   */
  async executeToolViaMCP(
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
      `\nActive handlers: ${this.toolRegistration.getAvailableTools().join(', ')}`,
    );
  }
}
