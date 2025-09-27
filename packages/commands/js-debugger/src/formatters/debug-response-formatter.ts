import path from 'path';
import type {
  IResponseFormatter,
  CallToolResult,
  DebugSession,
  ConsoleMessage,
  SessionLifecycleState,
  DebugState,
  DebugLocation,
  BreakpointStatusSummary,
  BreakpointStatusEntry,
} from '../types.js';

/**
 * Standard response formatter that eliminates JSON formatting duplication
 * Implements the IResponseFormatter SEAM for consistent output across all handlers
 */
export class DebugResponseFormatter implements IResponseFormatter {
  success(data: unknown): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  error(message: string, details?: unknown): CallToolResult {
    const errorData: Record<string, unknown> = { error: message };
    if (details !== undefined) {
      errorData.details = details;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorData, null, 2),
        },
      ],
      isError: true,
    };
  }

  async debugState(
    sessionId: string,
    session: DebugSession,
  ): Promise<CallToolResult> {
    const { state, consoleOutput } = session;

    if (state.status === 'terminated') {
      return this.success({
        sessionId,
        status: 'completed',
        message: 'Debug session completed',
      });
    }

    if (state.status === 'paused') {
      const stackTrace = await session.adapter.getStackTrace();
      const topFrame = stackTrace[0];
      const scopes = topFrame
        ? (await session.adapter.getScopes(topFrame.id)).filter(
            (scope) => scope.type !== 'global',
          )
        : [];

      const variables: Record<string, unknown> = {};
      for (const scope of scopes) {
        variables[scope.type] = Object.fromEntries(
          scope.variables.map((v) => [v.name, v.value]),
        );
      }

      const formattedStackTrace = stackTrace.map((frame) => ({
        frameId: frame.id,
        functionName: frame.functionName,
        file: frame.file,
        relativePath: frame.relativePath,
        origin: frame.origin,
        line: frame.line,
        column: frame.column,
      }));

      const currentLocation = this.deriveCurrentLocation(
        session,
        formattedStackTrace,
      );
      const breakpointSummary = this.buildBreakpointSummary(session);
      const messaging = this.buildPauseMessaging(state, currentLocation);

      const response: Record<string, unknown> = {
        sessionId,
        status: 'paused',
        pauseReason: state.pauseReason,
        breakpoint: state.breakpoint,
        exception: state.exception,
        location: currentLocation,
        hint: messaging.hint,
        stackTrace: formattedStackTrace.map((frame) => ({
          frameId: frame.frameId,
          functionName: frame.functionName,
          file: frame.file,
          relativePath: frame.relativePath,
          origin: frame.origin,
          line: frame.line,
          column: frame.column,
        })),
        variables,
        consoleOutput: this.formatConsoleMessages(consoleOutput),
        message: messaging.message,
      };

      if (breakpointSummary) {
        response.breakpoints = breakpointSummary;
      }

      return this.success(response);
    }

    return this.success({
      sessionId,
      status: state.status,
      message: 'Running… Will pause at next breakpoint or completion.',
    });
  }

  sessionsList(
    sessions: Array<{
      id: string;
      platform: string;
      target: string;
      state: DebugState;
      startTime: string;
      metadata?: {
        lifecycleState?: SessionLifecycleState;
        lastActivity?: string;
        resourceCount?: number;
      };
    }>,
    mockSessions?: Array<{ id: string; mock: true; [key: string]: unknown }>,
  ): CallToolResult {
    const allSessions = [...sessions, ...(mockSessions || [])];
    return this.success({ sessions: allSessions });
  }

  consoleOutput(data: {
    sessionId: string;
    consoleOutput: Array<{
      level: string;
      timestamp: string;
      message: string;
      args: unknown[];
    }>;
    filters?: unknown;
    totalCount: number;
    filteredCount?: number;
    status: string;
  }): CallToolResult {
    return this.success(data);
  }

  /**
   * Formats debug session info for running sessions
   */
  runningSession(
    sessionId: string,
    platform: string,
    target: string,
  ): CallToolResult {
    return this.success({
      sessionId,
      status: 'running',
      message: 'Running… Will pause at next breakpoint or completion.',
      platform,
      target,
    });
  }

  /**
   * Formats session termination response
   */
  terminatedSession(sessionId: string, message: string): CallToolResult {
    return this.success({
      sessionId,
      status: 'terminated',
      message,
    });
  }

  /**
   * Formats stack trace response
   */
  stackTrace(
    sessionId: string,
    session: DebugSession,
    stackTrace: Array<{
      frameId: number;
      functionName: string;
      file: string;
      line: number;
      column?: number;
      origin?: string;
      relativePath?: string;
    }>,
  ): CallToolResult {
    const location = this.deriveCurrentLocation(session, stackTrace);
    const messaging = this.buildPauseMessaging(session.state, location);
    const breakpointSummary = this.buildBreakpointSummary(session);

    const response: Record<string, unknown> = {
      sessionId,
      status: session.state.status,
      pauseReason: session.state.pauseReason,
      location,
      hint: messaging.hint,
      breakpoint: session.state.breakpoint,
      stackTrace,
      frameCount: stackTrace.length,
      message: messaging.message,
    };

    if (breakpointSummary) {
      response.breakpoints = breakpointSummary;
    }

    return this.success(response);
  }

  /**
   * Formats variable inspection response
   */
  variables(
    sessionId: string,
    frameId: number,
    data: { path: string; result: unknown },
  ): CallToolResult {
    return this.success({
      sessionId,
      frameId,
      path: data.path,
      result: data.result,
      message: `Variable inspection for path: ${data.path}`,
    });
  }

  /**
   * Formats evaluation result
   */
  evaluation(
    sessionId: string,
    evaluation: {
      expression?: string;
      result: unknown;
      type: string;
      error?: string;
    },
  ): CallToolResult {
    return this.success({
      sessionId,
      evaluation,
      status: 'paused',
      message: 'Evaluation complete. Session still paused.',
    });
  }

  /**
   * Formats console messages for output
   */
  private formatConsoleMessages(messages: ConsoleMessage[]) {
    return messages.slice(-10).map((msg) => ({
      level: msg.level,
      timestamp: msg.timestamp,
      message: msg.message,
      args: msg.args,
    }));
  }

  private deriveCurrentLocation(
    session: DebugSession,
    frames: Array<{
      file: string;
      line: number;
      column?: number;
      origin?: string;
      relativePath?: string;
    }>,
  ): DebugLocation | undefined {
    const provided = session.state.location;
    if (provided) {
      if (!provided.relativePath && frames[0]?.relativePath) {
        return { ...provided, relativePath: frames[0].relativePath };
      }
      return provided;
    }

    const topFrame = frames[0];
    if (!topFrame) {
      return undefined;
    }

    const origin = this.ensureOrigin(topFrame.origin);
    return {
      type: origin,
      file: topFrame.file || undefined,
      line: topFrame.line,
      column: topFrame.column,
      relativePath: topFrame.relativePath,
      description:
        origin === 'library'
          ? 'Dependency code (node_modules)'
          : origin === 'internal'
            ? 'Runtime code'
            : undefined,
    };
  }

  private buildPauseMessaging(
    state: DebugState,
    location?: DebugLocation,
  ): { message: string; hint?: string } {
    if (state.status === 'running') {
      return {
        message: 'Running… Will pause at next breakpoint or completion.',
      };
    }

    if (state.status === 'terminated') {
      return { message: 'Debug session completed' };
    }

    if (state.status !== 'paused') {
      return { message: `Debug session ${state.status}.` };
    }

    const locationLabel = location?.relativePath || location?.file;
    const lineSuffix = location?.line ? `:${location.line}` : '';
    const pauseReason = state.pauseReason;

    if (location?.type === 'internal' && pauseReason === 'entry') {
      return {
        message:
          'Debugger attached and paused at entry. Continue to run to your breakpoints.',
        hint: 'Currently paused in runtime internals. Use js-debugger_continue to reach your code.',
      };
    }

    if (location?.type === 'internal') {
      const description = location.description || 'runtime internals';
      return {
        message: `Paused in ${description}. Continue to reach your code.`,
        hint: 'Currently paused in runtime internals. Use js-debugger_continue to reach your code.',
      };
    }

    if (location?.type === 'library' && locationLabel) {
      return {
        message: `Paused in dependency code at ${locationLabel}${lineSuffix}`,
        hint: 'Paused inside dependency code. Step or continue to return to your application.',
      };
    }

    if (pauseReason === 'breakpoint' && locationLabel) {
      return {
        message: `Paused at breakpoint in ${locationLabel}${lineSuffix}`,
      };
    }

    if (locationLabel) {
      return {
        message: `Paused in ${locationLabel}${lineSuffix}`,
      };
    }

    return {
      message: 'Paused.',
    };
  }

  private buildBreakpointSummary(
    session: DebugSession,
  ): BreakpointStatusSummary | undefined {
    const requested = session.request.breakpoints ?? [];
    const registered = Array.from(session.breakpoints.values());

    if (requested.length === 0 && registered.length === 0) {
      return undefined;
    }

    const pending: BreakpointStatusEntry[] = [];

    for (const breakpoint of registered) {
      if (!breakpoint.verified) {
        pending.push({
          file: breakpoint.file,
          line: breakpoint.line,
          condition: breakpoint.condition,
          verified: false,
          resolvedLocations: breakpoint.resolvedLocations,
          status: 'pending',
          message:
            'Breakpoint registered but waiting for runtime confirmation.',
        });
      }
    }

    const registeredKeys = new Set(
      registered.map((bp) =>
        this.breakpointKey(bp.file, bp.line, bp.condition),
      ),
    );

    for (const requestedBreakpoint of requested) {
      const key = this.breakpointKey(
        requestedBreakpoint.file,
        requestedBreakpoint.line,
        requestedBreakpoint.condition,
      );
      if (!registeredKeys.has(key)) {
        pending.push({
          file: requestedBreakpoint.file,
          line: requestedBreakpoint.line,
          condition: requestedBreakpoint.condition,
          verified: false,
          status: 'not-registered',
          message: 'Breakpoint not yet registered with runtime.',
        });
      }
    }

    const setCount = registered.filter((bp) => bp.verified).length;
    const requestedCount = Math.max(requested.length, registered.length);

    return {
      requested: requestedCount,
      set: setCount,
      pending,
    };
  }

  private breakpointKey(
    file: string,
    line: number,
    condition?: string,
  ): string {
    return `${this.normalizePathForKey(file)}:${line}:${condition ?? ''}`;
  }

  private normalizePathForKey(file: string): string {
    if (!file || file.startsWith('[')) {
      return file;
    }

    if (file.startsWith('node:') || file.startsWith('chrome-extension:')) {
      return file;
    }

    try {
      return path.resolve(file).replace(/\\/g, '/');
    } catch {
      return file;
    }
  }

  private ensureOrigin(origin?: string): DebugLocation['type'] {
    switch (origin) {
      case 'user':
      case 'internal':
      case 'library':
      case 'unknown':
        return origin;
      default:
        return 'unknown';
    }
  }
}
