import type {
  CallToolResult,
  DebugRequest,
  MockDebugSession,
} from './index.js';

/**
 * Mock session management interface - separates mock logic from real logic
 */
export interface IMockSessionManager {
  createMockSession(request: DebugRequest): string;
  getMockSession(sessionId: string): MockDebugSession | undefined;
  deleteMockSession(sessionId: string): boolean;
  listMockSessions(): Array<{
    id: string;
    platform: string;
    target: string;
    state: { status: 'paused' };
    startTime: string;
    mock: true;
  }>;
  continueMockSession(
    sessionId: string,
    args: {
      action?: string;
      evaluate?: string;
    },
  ): CallToolResult;
  createInitialMockResponse(
    sessionId: string,
    request: DebugRequest,
  ): CallToolResult;
  getStackTraceMock(sessionId: string): CallToolResult;
  getConsoleOutputMock(
    sessionId: string,
    args: {
      levels?: Record<string, boolean>;
      search?: string;
      since?: number;
    },
  ): CallToolResult;
  getVariablesMock(args: {
    sessionId: string;
    path?: string;
    frameId?: number;
    maxDepth?: number;
  }): CallToolResult;
  stopMockSession(sessionId: string): CallToolResult;
}
