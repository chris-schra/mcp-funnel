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
 * Mock session manager - separates mock logic from real debug logic
 * Implements the IMockSessionManager interface for clean separation
 *
 * Refactored to use extracted modules for better maintainability:
 * - mock-data.ts: Mock data structures and generators
 * - mock-helpers.ts: Utility functions for mock operations
 * - mock-adapter.ts: Response generation logic
 */
export class MockSessionManager implements IMockSessionManager {
  private mockSessions = new Map<string, MockDebugSession>();
  private adapter = new MockDebugAdapter();

  createMockSession(request: DebugRequest): string {
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

  getMockSession(sessionId: string): MockDebugSession | undefined {
    return this.mockSessions.get(sessionId);
  }

  deleteMockSession(sessionId: string): boolean {
    return this.mockSessions.delete(sessionId);
  }

  listMockSessions(): Array<{
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

  continueMockSession(
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
   * Create initial mock debug session response
   */
  createInitialMockResponse(
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
   * Handle mock session stop
   */
  stopMockSession(sessionId: string): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createMockErrorResponse(sessionId, 'Mock session not found');
    }

    this.mockSessions.delete(sessionId);
    return this.adapter.createStopResponse(sessionId);
  }

  /**
   * Get mock stack trace
   */
  getStackTraceMock(sessionId: string): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createMockErrorResponse(sessionId, 'Mock session not found');
    }

    return this.adapter.createStackTraceResponse(sessionId, session);
  }

  /**
   * Get mock console output with filtering
   */
  getConsoleOutputMock(
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
   * Get mock variables with sophisticated inspection
   */
  getVariablesMock(args: {
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
