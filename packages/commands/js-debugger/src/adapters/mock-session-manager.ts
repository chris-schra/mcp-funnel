import type {
  IMockSessionManager,
  MockDebugSession,
  DebugRequest,
  CallToolResult,
} from '../types/index.js';
import {
  createSessionNotFoundResponse,
  formatConsoleMessages,
} from './mock-response-utils.js';
import { createMockVariables } from './mock-variable-generator.js';
import {
  handleMockPathAccess,
  handleMockScopeAccess,
} from './mock-variable-access.js';
import {
  createBreakpointPausedResponse,
  createInitialBreakpointResponse,
  createStackTraceMockResponse,
} from './mock-response-factory.js';

/**
 * Mock session manager - separates mock logic from real debug logic
 * Implements the IMockSessionManager interface for clean separation
 */
export class MockSessionManager implements IMockSessionManager {
  private mockSessions = new Map<string, MockDebugSession>();

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

      if (verbosity === 'all') {
        session.consoleOutput.push({
          level: 'log',
          timestamp: new Date().toISOString(),
          message: 'Starting application...',
          args: ['Starting application...'],
        });
      }

      if (['all', 'warn-error', 'error-only'].includes(verbosity)) {
        session.consoleOutput.push({
          level: 'error',
          timestamp: new Date().toISOString(),
          message:
            'Error: Potential memory leak detected! EventEmitter has 11 listeners attached',
          args: [
            'Error: Potential memory leak detected! EventEmitter has 11 listeners attached',
          ],
        });
      }
    }

    this.mockSessions.set(sessionId, session);
    return sessionId;
  }

  public getMockSession(sessionId: string): MockDebugSession | undefined {
    return this.mockSessions.get(sessionId);
  }

  public deleteMockSession(sessionId: string): boolean {
    return this.mockSessions.delete(sessionId);
  }

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

  public continueMockSession(
    sessionId: string,
    args: {
      action?: string;
      evaluate?: string;
    },
  ): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createSessionNotFoundResponse(sessionId);
    }

    if (args.evaluate) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId,
              evaluation: {
                expression: args.evaluate,
                result: `[Mock evaluated: ${args.evaluate}]`,
                type: 'string',
              },
              status: 'paused',
              message: '[MOCK] Evaluation complete. Session still paused.',
            }),
          },
        ],
      };
    }

    if (args.action === 'stop') {
      this.mockSessions.delete(sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId,
              status: 'terminated',
              message: '[MOCK] Debug session terminated by user',
            }),
          },
        ],
      };
    }

    session.currentBreakpointIndex++;

    if (
      session.currentBreakpointIndex >=
      (session.request.breakpoints?.length || 0)
    ) {
      this.mockSessions.delete(sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId,
              status: 'completed',
              message:
                '[MOCK] Debug session completed. All breakpoints visited.',
            }),
          },
        ],
      };
    }

    return createBreakpointPausedResponse(sessionId, session, args.action);
  }

  /**
   * Create initial mock debug session response
   */
  public createInitialMockResponse(
    sessionId: string,
    request: DebugRequest,
  ): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createSessionNotFoundResponse(sessionId);
    }

    if (!request.breakpoints || request.breakpoints.length === 0) {
      this.mockSessions.delete(sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId,
              status: 'completed',
              message: 'Debug session completed with no breakpoints (mock)',
            }),
          },
        ],
      };
    }

    return createInitialBreakpointResponse(
      sessionId,
      request,
      session.consoleOutput,
    );
  }

  /**
   * Handle mock session stop
   */
  public stopMockSession(sessionId: string): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createSessionNotFoundResponse(sessionId);
    }

    this.mockSessions.delete(sessionId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            sessionId,
            status: 'terminated',
            message: '[MOCK] Debug session stopped and cleaned up successfully',
          }),
        },
      ],
    };
  }

  /**
   * Get mock stack trace
   */
  public getStackTraceMock(sessionId: string): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return createSessionNotFoundResponse(sessionId);
    }

    return createStackTraceMockResponse(sessionId, session);
  }

  /**
   * Get mock console output with filtering
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
      return createSessionNotFoundResponse(sessionId);
    }

    const output =
      args.since !== undefined
        ? session.consoleOutput.slice(args.since)
        : session.consoleOutput;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId,
              consoleOutput: formatConsoleMessages(output),
              totalCount: session.consoleOutput.length,
              returnedCount: output.length,
              status: 'mock',
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  /**
   * Get mock variables with sophisticated inspection
   */
  public getVariablesMock(args: {
    sessionId: string;
    path?: string;
    frameId?: number;
    maxDepth?: number;
  }): CallToolResult {
    const session = this.mockSessions.get(args.sessionId);
    if (!session) {
      return createSessionNotFoundResponse(args.sessionId);
    }

    const frameId = args.frameId ?? 0;
    const maxDepth = args.maxDepth ?? 3;

    const mockVariables = createMockVariables(session);

    if (args.path) {
      return handleMockPathAccess(
        args.sessionId,
        args.path,
        frameId,
        mockVariables,
      );
    } else {
      return handleMockScopeAccess(
        args.sessionId,
        frameId,
        maxDepth,
        mockVariables,
      );
    }
  }
}
