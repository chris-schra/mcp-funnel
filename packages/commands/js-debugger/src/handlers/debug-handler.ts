import path from 'path';
import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  DebugRequest,
} from '../types/index.js';

export interface DebugHandlerArgs {
  platform: 'node' | 'browser';
  target: string;
  command?: string;
  args?: string[];
  runtimeArgs?: string[];
  breakpoints?: Array<{
    file: string;
    line: number;
    condition?: string;
  }>;
  timeout?: number;
  evalExpressions?: string[];
  captureConsole?: boolean;
  consoleVerbosity?: 'all' | 'warn-error' | 'error-only' | 'none';
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
