import path from 'path';
import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  DebugRequest,
} from '../types/index.js';

/**
 * Arguments for starting a new debug session.
 * @public
 * @see file:../types/handlers.ts:14 - IToolHandler interface
 * @see file:../types/request.ts:1 - DebugRequest type
 */
export interface DebugHandlerArgs {
  /** Target platform - determines which debug adapter to use */
  platform: 'node' | 'browser';

  /**
   * Debug target specification.
   *
   * For Node: file path to script (relative or absolute) or WebSocket inspector URL (ws:// or wss://).
   * For Browser: URL to debug or connection mode.
   */
  target: string;

  /**
   * Runtime command for Node platform.
   * Specifies which Node-compatible runtime to use (e.g., "node", "tsx", "ts-node").
   * Only applicable when platform is 'node'.
   * @default "node"
   */
  command?: string;

  /**
   * CLI arguments passed to the script.
   * Additional arguments forwarded to the target script when launching.
   * Only applicable when platform is 'node' and target is a file path.
   */
  args?: string[];

  /**
   * Arguments forwarded to the runtime executable.
   * Runtime flags passed before the script path (e.g., Node flags like --inspect-brk).
   * Only applicable when platform is 'node'.
   */
  runtimeArgs?: string[];

  /**
   * Initial breakpoints to set before execution.
   * For Node platform with file paths: paths are resolved to absolute paths if relative.
   * Not modified for WebSocket inspector targets or browser platform.
   */
  breakpoints?: Array<{
    /** File path for the breakpoint */
    file: string;
    /** Line number (1-based) */
    line: number;
    /** Optional condition for conditional breakpoint */
    condition?: string;
  }>;

  /**
   * Timeout in milliseconds for session initialization.
   * How long to wait for the debugger to pause before returning a response.
   * If timeout is reached, returns a "running" session status rather than an error.
   * @default 30000
   */
  timeout?: number;

  /**
   * JavaScript expressions to evaluate at first pause.
   * These expressions are evaluated in the paused execution context.
   */
  evalExpressions?: string[];

  /**
   * Whether to capture console output from the debugged process.
   * @default false
   */
  captureConsole?: boolean;

  /**
   * Console output verbosity level.
   * Controls which console messages are captured and returned.
   * @default "all"
   */
  consoleVerbosity?: 'all' | 'warn-error' | 'error-only' | 'none';

  /**
   * Whether to use mock implementation instead of real debugger.
   * When true, creates a simulated debug session for testing.
   * Also activated when JS_DEBUGGER_REAL environment variable is 'false'.
   * @default false
   */
  useMock?: boolean;
}

/**
 * Tool handler for starting new debug sessions.
 *
 * Creates and initializes debug sessions for both Node.js and browser platforms,
 * with support for breakpoints, expression evaluation, and console capture.
 * The handler performs path resolution for Node file targets and waits for
 * initial pause state before returning.
 *
 * Key behaviors:
 * - Node file paths: Converts relative paths to absolute and resolves breakpoint paths
 * - WebSocket inspector targets: Uses paths as-is without modification
 * - Mock sessions: Routes to mock implementation when useMock=true or JS_DEBUGGER_REAL='false'
 * - Timeout handling: Returns "running" status if debugger doesn't pause within timeout
 * - Session creation: Delegates to context.sessionManager for real sessions
 *
 * IMPORTANT: The handler uses ToolHandlerContext.sessionManager.waitForPause with the
 * specified timeout (default 30 seconds) to wait for the debugger to reach its first
 * pause point. If the timeout expires, it returns a "running session" response rather
 * than an error, allowing the caller to poll for pause state.
 * @example Starting a Node.js debug session
 * ```typescript
 * const handler = new DebugHandler();
 * const result = await handler.handle({
 *   platform: 'node',
 *   target: './src/app.ts',
 *   command: 'tsx',
 *   breakpoints: [{ file: './src/app.ts', line: 42 }],
 *   timeout: 5000
 * }, context);
 * ```
 * @example Starting a browser debug session
 * ```typescript
 * const result = await handler.handle({
 *   platform: 'browser',
 *   target: 'http://localhost:3000',
 *   captureConsole: true,
 *   consoleVerbosity: 'warn-error'
 * }, context);
 * ```
 * @example Using mock implementation for testing
 * ```typescript
 * const result = await handler.handle({
 *   platform: 'node',
 *   target: './test.js',
 *   useMock: true
 * }, context);
 * ```
 * @public
 * @see file:../types/handlers.ts:14 - IToolHandler interface
 * @see file:../types/session.ts:36 - DebugSession interface
 * @see file:../session-manager.ts:1 - SessionManager implementation
 * @see file:./index.ts:1 - Handler exports
 */
export class DebugHandler implements IToolHandler<DebugHandlerArgs> {
  public readonly name = 'debug';

  /**
   * Creates and initializes a debug session.
   *
   * Processes the arguments to prepare a DebugRequest, resolves paths for Node
   * platform when needed, creates the session (mock or real), and waits for the
   * debugger to pause at its initial state.
   * @param {DebugHandlerArgs} args - Configuration for the debug session to create
   * @param {ToolHandlerContext} context - Handler context with session manager and response formatter
   * @returns {Promise<CallToolResult>} Promise resolving to formatted debug state or error result
   * @see file:../types/handlers.ts:22 - ToolHandlerContext interface
   * @see file:../session-manager.ts - SessionManager.createSession method
   */
  public async handle(
    args: DebugHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      let target = args.target;
      let breakpoints = args.breakpoints;

      const isMock = Boolean(args.useMock);
      const isNodePlatform = args.platform === 'node';
      const isInspectorTarget =
        typeof target === 'string' &&
        (target.startsWith('ws://') || target.startsWith('wss://'));

      if (isNodePlatform && !isMock && !isInspectorTarget) {
        target = path.isAbsolute(target) ? target : path.resolve(target);
        if (breakpoints) {
          breakpoints = breakpoints.map((bp) => ({
            ...bp,
            file: path.isAbsolute(bp.file) ? bp.file : path.resolve(bp.file),
          }));
        }
      }

      const request: DebugRequest = {
        platform: args.platform,
        target,
        command: args.command,
        args: args.args,
        runtimeArgs: args.runtimeArgs,
        stopOnEntry: true,
        breakpoints,
        timeout: args.timeout,
        evalExpressions: args.evalExpressions,
        captureConsole: args.captureConsole,
        consoleVerbosity: args.consoleVerbosity,
      };

      // Check if we should use mock implementation
      const shouldUseMock =
        args.useMock || process.env.JS_DEBUGGER_REAL === 'false';

      if (shouldUseMock) {
        if (!context.mockSessionManager) {
          return context.responseFormatter.error(
            'Mock session manager not available',
            { useMock: true },
          );
        }

        const sessionId = context.mockSessionManager.createMockSession(request);
        return context.mockSessionManager.createInitialMockResponse(
          sessionId,
          request,
        );
      }

      // Create real debug session
      const session = await context.sessionManager.createSession(request);

      if (!session) {
        return context.responseFormatter.error(
          'Failed to create debug session',
        );
      }

      const awaitedSession = await context.sessionManager.waitForPause(
        session.id,
        request.timeout ?? 30000,
      );

      const latestSession = awaitedSession
        ? awaitedSession
        : context.sessionManager.getSession(session.id);

      if (!latestSession) {
        return context.responseFormatter.error(
          'Debug session unavailable after initialization',
        );
      }

      if (latestSession.state.status !== 'paused') {
        return context.responseFormatter.runningSession(
          session.id,
          request.platform,
          request.target,
        );
      }

      return await context.responseFormatter.debugState(
        session.id,
        latestSession,
      );
    } catch (error) {
      return context.responseFormatter.error(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
