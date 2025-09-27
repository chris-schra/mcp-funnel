import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  DebugRequest,
} from '../types.js';

export interface DebugHandlerArgs {
  platform: 'node' | 'browser';
  target: string;
  command?: string;
  args?: string[];
  breakpoints?: Array<{
    file: string;
    line: number;
    condition?: string;
  }>;
  timeout?: number;
  evalExpressions?: string[];
  captureConsole?: boolean;
  consoleVerbosity?: 'all' | 'warn-error' | 'error-only' | 'none';
  stopOnEntry?: boolean;
  useMock?: boolean;
}

/**
 * Handler for starting debug sessions
 * Implements the IToolHandler SEAM for modular tool handling
 */
export class DebugHandler implements IToolHandler<DebugHandlerArgs> {
  readonly name = 'debug';

  async handle(
    args: DebugHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      const request: DebugRequest = {
        platform: args.platform,
        target: args.target,
        command: args.command,
        args: args.args,
        breakpoints: args.breakpoints,
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
      const sessionId = await context.sessionManager.createSession(request);
      const session = context.sessionManager.getSession(sessionId);

      if (!session) {
        return context.responseFormatter.error(
          'Failed to create debug session',
        );
      }

      // For running sessions (not paused), return session info immediately
      if (session.state.status === 'running') {
        return context.responseFormatter.runningSession(
          sessionId,
          request.platform,
          request.target,
        );
      }

      // For paused sessions, return full debug info
      return await context.responseFormatter.debugState(sessionId, session);
    } catch (error) {
      return context.responseFormatter.error(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
