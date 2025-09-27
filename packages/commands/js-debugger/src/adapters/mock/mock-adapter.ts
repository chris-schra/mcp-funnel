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
 * Mock debug adapter that handles the generation of mock responses
 * This separates the response generation logic from session management
 */
export class MockDebugAdapter {
  /**
   * Create initial debug response when session starts
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
   * Create continue response for mock session
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
   * Create stack trace response
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
   * Create console output response
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
   * Create variables response
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
   * Create stop response
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
   * Create breakpoint information object
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
