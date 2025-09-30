import type {
  IMockSessionManager,
  MockDebugSession,
  DebugRequest,
  CallToolResult,
} from '../types/index.js';
import { createMockConsoleOutput } from './mock/mock-data.js';
import {
  createMockErrorResponse,
  validateAndNormalizePath,
  shouldAutoTerminateSession,
  hasReachedEndOfBreakpoints,
} from './mock/mock-helpers.js';
import { MockDebugAdapter } from './mock/mock-adapter.js';

/**
 * Mock session manager for testing and demonstration purposes.
 *
 * Provides a lightweight alternative to real debug sessions by generating
 * predetermined responses based on the debug request configuration. This is
 * useful for testing tool integrations without spawning actual debug processes.
 *
 * The manager simulates debug session behavior including:
 * - Breakpoint pausing with synthetic stack traces
 * - Console output generation based on verbosity settings
 * - Variable inspection with mock scope data
 * - Session lifecycle management (pause, continue, stop)
 * @remarks
 * Mock sessions are stateful and track the current breakpoint index to simulate
 * stepping through code. Sessions automatically terminate when all breakpoints
 * have been visited or when explicitly stopped.
 * @example
 * ```typescript
 * const manager = new MockSessionManager();
 * const sessionId = manager.createMockSession({
 *   platform: 'node',
 *   target: 'test.js',
 *   breakpoints: [{ file: 'test.js', line: 10 }],
 *   captureConsole: true
 * });
 * const response = manager.createInitialMockResponse(sessionId, request);
 * ```
 * @see file:./mock/mock-adapter.ts - Response generation logic
 * @see file:./mock/mock-data.ts - Mock data structures
 * @see file:../../types/handlers.ts:122 - IMockSessionManager interface
 * @internal
 */
export class MockSessionManager implements IMockSessionManager {
  private mockSessions = new Map<string, MockDebugSession>();
  private adapter = new MockDebugAdapter();

  /**
   * Creates a new mock debug session with generated state.
   *
   * Initializes session state including breakpoint tracking, console output
   * (if enabled), and event logging. The session is stored internally and
   * can be retrieved by its generated UUID.
   * @param request - Debug configuration including platform, target, and breakpoints
   * @returns Unique session identifier (UUID v4)
   * @example
   * ```typescript
   * const sessionId = manager.createMockSession({
   *   platform: 'browser',
   *   target: 'http://localhost:3000',
   *   breakpoints: [{ file: 'app.js', line: 42 }],
   *   consoleVerbosity: 'warn-error'
   * });
   * ```
   */
  public createMockSession(request: DebugRequest): string {
    const sessionId = crypto.randomUUID();
    const startTime = new Date().toISOString();

    const session: MockDebugSession = {
      request,
      currentBreakpointIndex: 0,
      events: [],
      startTime,
      consoleOutput: [],
    };

    // Add mock console output based on verbosity settings
    if (request.captureConsole !== false) {
      const verbosity = request.consoleVerbosity || 'all';
      session.consoleOutput = createMockConsoleOutput(verbosity);
    }

    this.mockSessions.set(sessionId, session);
    return sessionId;
  }

  /**
   * Retrieves a mock session by its identifier.
   * @param sessionId - UUID of the mock session to retrieve
   * @returns Mock session object if found, undefined otherwise
   */
  public getMockSession(sessionId: string): MockDebugSession | undefined {
    return this.mockSessions.get(sessionId);
  }

  /**
   * Deletes a mock session from the internal store.
   * @param sessionId - UUID of the mock session to delete
   * @returns True if session existed and was deleted, false otherwise
   */
  public deleteMockSession(sessionId: string): boolean {
    return this.mockSessions.delete(sessionId);
  }

  /**
   * Lists all active mock sessions with their current state.
   *
   * All mock sessions are reported as 'paused' since they don't run
   * asynchronously and only advance when explicitly continued.
   * @returns Array of session summaries including id, platform, target, and state
   */
  public listMockSessions(): Array<{
    id: string;
    platform: string;
    target: string;
    state: { status: 'paused' };
    startTime: string;
    mock: true;
  }> {
    return Array.from(this.mockSessions.entries()).map(([id, session]) => ({
      id,
      platform: session.request.platform,
      target: session.request.target,
      state: { status: 'paused' as const },
      startTime: session.startTime,
      mock: true as const,
    }));
  }

  /**
   * Continues or controls a mock debug session.
   *
   * Handles various session control actions:
   * - Continue to next breakpoint (default behavior)
   * - Evaluate expressions without advancing
   * - Stop and terminate the session
   *
   * The session advances its breakpoint index on each continue action
   * (unless evaluating) and automatically terminates when all breakpoints
   * have been visited.
   * @param sessionId - UUID of the mock session to control
   * @param args - Control parameters containing action and evaluate options
   * @returns MCP tool result with updated session state or error
   */
  public continueMockSession(
    sessionId: string,
    args: {
      action?: string;
      evaluate?: string;
    },
  ): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createMockErrorResponse(sessionId, 'Mock session not found');
    }

    // Handle session termination actions first
    if (args.action === 'stop') {
      this.mockSessions.delete(sessionId);
      return this.adapter.createStopResponse(sessionId);
    }

    // Advance to next breakpoint (unless evaluating)
    if (!args.evaluate) {
      session.currentBreakpointIndex++;
    }

    // Check if session should end
    if (!args.evaluate && hasReachedEndOfBreakpoints(session)) {
      this.mockSessions.delete(sessionId);
    }

    return this.adapter.createContinueResponse(sessionId, session, args);
  }

  /**
   * Creates the initial response for a newly created mock debug session.
   *
   * Generates a paused state at the first breakpoint or a completed state if
   * no breakpoints are configured. Sessions with no breakpoints are automatically
   * terminated and removed from the internal store.
   * @param sessionId - UUID of the mock session to initialize
   * @param _request - Debug request (unused, kept for interface compatibility)
   * @returns MCP tool result with initial session state or error if session not found
   */
  public createInitialMockResponse(
    sessionId: string,
    _request: DebugRequest,
  ): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createMockErrorResponse(sessionId, 'Mock session creation failed');
    }

    // Auto-terminate sessions with no breakpoints
    if (shouldAutoTerminateSession(session)) {
      this.mockSessions.delete(sessionId);
    }

    return this.adapter.createInitialResponse(sessionId, session);
  }

  /**
   * Stops and terminates a mock debug session.
   *
   * Removes the session from the internal store and returns a terminated
   * status response. Safe to call on non-existent sessions (returns error).
   * @param sessionId - UUID of the mock session to stop
   * @returns MCP tool result with terminated status or error if session not found
   */
  public stopMockSession(sessionId: string): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createMockErrorResponse(sessionId, 'Mock session not found');
    }

    this.mockSessions.delete(sessionId);
    return this.adapter.createStopResponse(sessionId);
  }

  /**
   * Retrieves a mock stack trace for a paused session.
   *
   * Generates a synthetic call stack with three frames based on the first
   * breakpoint location. The stack always shows: processUserData -\> handleRequest -\> main.
   * @param sessionId - UUID of the mock session to inspect
   * @returns MCP tool result with mock stack frames or error if session not found
   */
  public getStackTraceMock(sessionId: string): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createMockErrorResponse(sessionId, 'Mock session not found');
    }

    return this.adapter.createStackTraceResponse(sessionId, session);
  }

  /**
   * Retrieves mock console output with optional filtering.
   *
   * Returns console messages captured during the mock session. The response
   * includes the last 10 messages formatted for display, along with count
   * metadata. Note that level and search filtering are not currently applied
   * in the mock implementation.
   * @param sessionId - UUID of the mock session to query
   * @param args - Filter parameters containing levels, search, and since options
   * @returns MCP tool result with formatted console messages and counts, or error if session not found
   */
  public getConsoleOutputMock(
    sessionId: string,
    args: {
      levels?: Record<string, boolean>;
      search?: string;
      since?: number;
    },
  ): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createMockErrorResponse(sessionId, 'Mock session not found');
    }

    return this.adapter.createConsoleOutputResponse(sessionId, session, args);
  }

  /**
   * Inspects mock variables using dot-notation path access.
   *
   * Generates mock variable scopes (local and closure) and resolves the
   * requested path through them. Supports nested property access (e.g.,
   * "userData.profile.settings.theme"). Path validation ensures the path
   * parameter is a non-empty string.
   * @param args - Variable inspection parameters containing sessionId, path, frameId, and maxDepth
   * @returns MCP tool result with variable value and type, or error if session/path not found
   */
  public getVariablesMock(args: {
    sessionId: string;
    path: string;
    frameId?: number;
    maxDepth?: number;
  }): CallToolResult {
    const session = this.mockSessions.get(args.sessionId);
    if (!session) {
      return createMockErrorResponse(args.sessionId, 'Mock session not found');
    }

    const trimmedPath = validateAndNormalizePath(args.path);
    if (!trimmedPath) {
      return createMockErrorResponse(
        args.sessionId,
        'Variable path is required. Provide the dot-notation path using the "path" parameter.',
      );
    }

    return this.adapter.createVariablesResponse(args.sessionId, session, {
      ...args,
      path: trimmedPath,
    });
  }
}
