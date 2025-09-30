import type {
  CallToolResult,
  MockDebugSession,
  DebugLocation,
} from '../../types/index.js';
import {
  createMockVariables,
  createMockStackTrace,
  createMockBreakpointsSummary,
  createMockEvaluationResult,
  formatMockConsoleOutput,
} from './mock-data.js';
import {
  buildMockLocation,
  handleMockPathAccess,
  createMockSuccessResponse,
  generateLocationLabel,
  generateLineSuffix,
  hasReachedEndOfBreakpoints,
} from './mock-helpers.js';

/**
 * Mock debug adapter that handles the generation of mock responses.
 *
 * This adapter generates realistic mock debug responses for testing and development,
 * separating response generation logic from session management. It creates mock
 * breakpoint pauses, stack traces, variable scopes, and console output without
 * requiring an actual debug connection.
 * @example
 * ```typescript
 * const adapter = new MockDebugAdapter();
 * const response = adapter.createInitialResponse(sessionId, mockSession);
 * ```
 * @internal
 * @see file:./mock-session-manager.ts - Session management using this adapter
 * @see file:./mock-data.ts - Mock data generation functions
 */
export class MockDebugAdapter {
  /**
   * Creates the initial debug response when a mock session starts.
   *
   * Generates a paused state at the first breakpoint with mock stack trace,
   * variables, and console output. If no breakpoints are configured, returns
   * a completed session response.
   * @param sessionId - Unique identifier for the debug session
   * @param session - Mock session containing request details and state
   * @returns MCP tool result with paused or completed state
   */
  createInitialResponse(
    sessionId: string,
    session: MockDebugSession,
  ): CallToolResult {
    if (
      !session.request.breakpoints ||
      session.request.breakpoints.length === 0
    ) {
      return createMockSuccessResponse(
        sessionId,
        {
          status: 'completed',
        },
        'Debug session completed with no breakpoints (mock)',
      );
    }

    const bp = session.request.breakpoints[0];
    const location = buildMockLocation(bp.file, bp.line);
    const breakpoints = createMockBreakpointsSummary(session);
    const lineSuffix = generateLineSuffix(location.line);
    const locationLabel = generateLocationLabel(location, bp.file);

    return createMockSuccessResponse(
      sessionId,
      {
        status: 'paused',
        pauseReason: 'breakpoint',
        mock: true,
        breakpoint: this.createBreakpointInfo(
          bp,
          location,
          0,
          session.request.breakpoints.length,
        ),
        stackTrace: createMockStackTrace(location, ['processData', 'main']),
        location,
        hint: 'Mock pause. Use js-debugger_continue to proceed to the next step.',
        breakpoints,
        variables: {
          local: { index: 42, data: { type: 'mock', value: 'example' } },
          closure: { config: { debug: true } },
        },
        consoleOutput: session.consoleOutput,
      },
      `[MOCK] Paused at breakpoint in ${locationLabel}${lineSuffix}`,
    );
  }

  /**
   * Creates a continue response for an ongoing mock session.
   *
   * Handles three scenarios:
   * 1. Expression evaluation (returns paused state with evaluation result)
   * 2. Stop action (terminates session)
   * 3. Continue/step actions (advances to next breakpoint or completes)
   * @param sessionId - Unique identifier for the debug session
   * @param session - Current mock session state
   * @param args - Action parameters
   * @param args.action - Debug action: 'continue', 'step_over', 'step_into', 'step_out', or 'stop'
   * @param args.evaluate - JavaScript expression to evaluate in the mock context
   * @returns MCP tool result with updated session state (paused, terminated, or completed)
   */
  createContinueResponse(
    sessionId: string,
    session: MockDebugSession,
    args: { action?: string; evaluate?: string },
  ): CallToolResult {
    // Handle evaluation requests
    if (args.evaluate) {
      const evaluation = createMockEvaluationResult(args.evaluate);
      return createMockSuccessResponse(
        sessionId,
        {
          evaluation,
          status: 'paused',
        },
        '[MOCK] Evaluation complete. Session still paused.',
      );
    }

    // Handle stop action
    if (args.action === 'stop') {
      return createMockSuccessResponse(
        sessionId,
        {
          status: 'terminated',
        },
        '[MOCK] Debug session terminated by user',
      );
    }

    // Handle reaching end of breakpoints
    if (hasReachedEndOfBreakpoints(session)) {
      return createMockSuccessResponse(
        sessionId,
        {
          status: 'completed',
        },
        '[MOCK] Debug session completed. All breakpoints visited.',
      );
    }

    // Continue to next breakpoint
    const bp = session.request.breakpoints![session.currentBreakpointIndex];
    const location = buildMockLocation(bp.file, bp.line);
    const breakpoints = createMockBreakpointsSummary(session);
    const lineSuffix = generateLineSuffix(location.line);
    const locationLabel = generateLocationLabel(location, bp.file);

    return createMockSuccessResponse(
      sessionId,
      {
        status: 'paused',
        pauseReason: 'breakpoint',
        mock: true,
        action: args.action || 'continue',
        breakpoint: this.createBreakpointInfo(
          bp,
          location,
          session.currentBreakpointIndex,
          session.request.breakpoints!.length,
        ),
        stackTrace: createMockStackTrace(location, ['processNext', 'main']),
        location,
        hint: 'Mock pause. Use js-debugger_continue to proceed to the next step.',
        variables: {
          local: {
            index: 42 + session.currentBreakpointIndex * 10,
            iteration: session.currentBreakpointIndex,
          },
        },
        consoleOutput: session.consoleOutput.slice(-5),
        breakpoints,
      },
      `[MOCK] Paused at breakpoint in ${locationLabel}${lineSuffix}`,
    );
  }

  /**
   * Creates a stack trace response for a mock session.
   *
   * Generates a synthetic call stack with three frames (processUserData,
   * handleRequest, main) based on the first breakpoint location in the session.
   * @param sessionId - Unique identifier for the debug session
   * @param session - Current mock session state
   * @returns MCP tool result with mock stack trace and breakpoint info
   */
  createStackTraceResponse(
    sessionId: string,
    session: MockDebugSession,
  ): CallToolResult {
    const firstBreakpoint = session.request.breakpoints?.[0];
    const location = buildMockLocation(
      firstBreakpoint?.file || 'main.js',
      firstBreakpoint?.line ?? 15,
    );

    const mockStackTrace = createMockStackTrace(location, [
      'processUserData',
      'handleRequest',
      'main',
    ]);

    const breakpoints = createMockBreakpointsSummary(session);
    const lineSuffix = generateLineSuffix(location.line);
    const locationLabel = generateLocationLabel(location, 'mock-target.js');

    return createMockSuccessResponse(
      sessionId,
      {
        status: 'paused',
        pauseReason: 'breakpoint',
        location,
        hint: 'Mock pause. Use js-debugger_continue to proceed to the next step.',
        breakpoint: firstBreakpoint
          ? this.createBreakpointInfo(firstBreakpoint, location, 0, 1)
          : undefined,
        stackTrace: mockStackTrace,
        frameCount: mockStackTrace.length,
        breakpoints,
      },
      `[MOCK] Paused at breakpoint in ${locationLabel}${lineSuffix}`,
    );
  }

  /**
   * Creates a console output response for a mock session.
   *
   * Returns console messages from the session, optionally filtered by index.
   * The response includes formatted output (last 10 messages) along with
   * count metadata.
   * @param sessionId - Unique identifier for the debug session
   * @param session - Current mock session state with console output
   * @param args - Filter parameters
   * @param args.levels - Log level filters (currently not applied in mock implementation)
   * @param args.search - Search string filter (currently not applied in mock implementation)
   * @param args.since - Starting index for messages (0-based, undefined returns all messages)
   * @returns MCP tool result with formatted console output and message counts
   */
  createConsoleOutputResponse(
    sessionId: string,
    session: MockDebugSession,
    args: { levels?: Record<string, boolean>; search?: string; since?: number },
  ): CallToolResult {
    const output =
      args.since !== undefined
        ? session.consoleOutput.slice(args.since)
        : session.consoleOutput;

    return createMockSuccessResponse(sessionId, {
      consoleOutput: formatMockConsoleOutput(output),
      totalCount: session.consoleOutput.length,
      returnedCount: output.length,
      status: 'mock',
    });
  }

  /**
   * Creates a variables inspection response for a mock session.
   *
   * Generates mock variable scopes and resolves the requested variable path
   * through the local and closure scopes. Supports dot-notation path traversal
   * for nested properties.
   * @param sessionId - Unique identifier for the debug session
   * @param session - Current mock session state
   * @param args - Variable access parameters
   * @param args.path - Dot-notation path to variable (e.g., "userData.profile.settings")
   * @param args.frameId - Stack frame to inspect (defaults to 0, currently unused in mock)
   * @param args.maxDepth - Maximum traversal depth (currently unused in mock implementation)
   * @returns MCP tool result with variable value and type information
   */
  createVariablesResponse(
    sessionId: string,
    session: MockDebugSession,
    args: { path: string; frameId?: number; maxDepth?: number },
  ): CallToolResult {
    const frameId = args.frameId ?? 0;
    const mockVariables = createMockVariables(session);

    return handleMockPathAccess(sessionId, args.path, frameId, mockVariables);
  }

  /**
   * Creates a termination response when stopping a mock session.
   *
   * Generates a terminated status response indicating the session has been
   * successfully stopped and cleaned up.
   * @param sessionId - Unique identifier for the debug session being stopped
   * @returns MCP tool result with terminated status
   */
  createStopResponse(sessionId: string): CallToolResult {
    return createMockSuccessResponse(
      sessionId,
      {
        status: 'terminated',
      },
      '[MOCK] Debug session stopped and cleaned up successfully',
    );
  }

  /**
   * Creates a breakpoint information object for response payloads.
   *
   * Constructs a detailed breakpoint descriptor including its position in the
   * breakpoint sequence, verification status, and resolved location details.
   * All mock breakpoints are marked as verified.
   * @param bp - Original breakpoint request
   * @param bp.file - Requested file path
   * @param bp.line - Requested line number
   * @param bp.condition - Optional conditional expression
   * @param location - Resolved debug location with absolute and relative paths
   * @param index - Zero-based position in the breakpoint sequence
   * @param total - Total number of breakpoints in the session
   * @returns Breakpoint info object for inclusion in debug responses
   */
  private createBreakpointInfo(
    bp: { file: string; line: number; condition?: string },
    location: DebugLocation,
    index: number,
    total: number,
  ) {
    return {
      id: `mock-breakpoint-${index}`,
      file: location.file || bp.file,
      line: location.line ?? bp.line,
      index,
      total,
      condition: bp.condition,
      verified: true,
      resolvedLocations: location.file
        ? [
            {
              file: location.file,
              line: location.line ?? bp.line,
            },
          ]
        : undefined,
    };
  }
}
