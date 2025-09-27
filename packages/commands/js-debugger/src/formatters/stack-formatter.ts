import path from 'path';
import type {
  DebugSession,
  DebugState,
  DebugLocation,
  BreakpointStatusSummary,
  BreakpointStatusEntry,
} from '../types/index.js';

/**
 * Stack trace and debugging state formatting utilities
 *
 * Handles complex formatting for:
 * - Debug session states (paused, running, terminated)
 * - Stack trace information
 * - Breakpoint status summaries
 * - Location derivation and pause messaging
 */
export class StackFormatter {
  /**
   * Format complete debug state response
   */
  static async formatDebugState(
    sessionId: string,
    session: DebugSession,
  ): Promise<Record<string, unknown>> {
    const { state } = session;

    if (state.status === 'terminated') {
      return {
        sessionId,
        status: 'completed',
        message: 'Debug session completed',
      };
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

      const currentLocation = StackFormatter.deriveCurrentLocation(
        session,
        formattedStackTrace,
      );
      const breakpointSummary = StackFormatter.buildBreakpointSummary(session);
      const messaging = StackFormatter.buildPauseMessaging(
        state,
        currentLocation,
      );

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
        consoleOutput: session.consoleOutput.slice(-10).map((msg) => ({
          level: msg.level,
          timestamp: msg.timestamp,
          message: msg.message,
          args: msg.args,
        })),
        message: messaging.message,
      };

      if (breakpointSummary) {
        response.breakpoints = breakpointSummary;
      }

      return response;
    }

    return {
      sessionId,
      status: state.status,
      message: 'Running… Will pause at next breakpoint or completion.',
    };
  }

  /**
   * Format stack trace response
   */
  static formatStackTrace(
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
  ): Record<string, unknown> {
    const location = StackFormatter.deriveCurrentLocation(session, stackTrace);
    const messaging = StackFormatter.buildPauseMessaging(
      session.state,
      location,
    );
    const breakpointSummary = StackFormatter.buildBreakpointSummary(session);

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

    return response;
  }

  /**
   * Derive current location from session state and stack frames
   */
  static deriveCurrentLocation(
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

    const origin = StackFormatter.ensureOrigin(topFrame.origin);
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

  /**
   * Build contextual messaging for pause states
   */
  static buildPauseMessaging(
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

    if (pauseReason === 'debugger') {
      const locationSuffix = locationLabel
        ? ` in ${locationLabel}${lineSuffix}`
        : '';
      return {
        message: `Paused on debugger statement${locationSuffix}`,
        hint: 'Use js-debugger_continue to step past the manual debugger statement.',
      };
    }

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

  /**
   * Build breakpoint status summary
   */
  static buildBreakpointSummary(
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
        StackFormatter.breakpointKey(bp.file, bp.line, bp.condition),
      ),
    );

    for (const requestedBreakpoint of requested) {
      const key = StackFormatter.breakpointKey(
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

  /**
   * Generate breakpoint key for comparison
   */
  private static breakpointKey(
    file: string,
    line: number,
    condition?: string,
  ): string {
    return `${StackFormatter.normalizePathForKey(file)}:${line}:${condition ?? ''}`;
  }

  /**
   * Normalize file path for consistent comparison
   */
  private static normalizePathForKey(file: string): string {
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

  /**
   * Ensure origin type is valid
   */
  private static ensureOrigin(origin?: string): DebugLocation['type'] {
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
