import type { DebugRequest } from './request.js';
import type { DebugState, CodeOrigin } from './debug-state.js';
import type {
  DebugSession,
  SessionLifecycleState,
  ISessionManager,
} from './session.js';

// SEAMS: Extension point interfaces for the refactored architecture

/**
 * Main extension point for MCP tool handlers
 */
export interface IToolHandler<TArgs = Record<string, unknown>> {
  readonly name: string;
  handle(args: TArgs, context: ToolHandlerContext): Promise<CallToolResult>;
}

/**
 * Shared context available to all tool handlers
 */
export interface ToolHandlerContext {
  sessionManager: ISessionManager;
  responseFormatter: IResponseFormatter;
  sessionValidator: ISessionValidator;
  mockSessionManager?: IMockSessionManager;
}

/**
 * Response formatting extension point - eliminates JSON formatting duplication
 */
export interface IResponseFormatter {
  success(data: unknown): CallToolResult;
  error(message: string, details?: unknown): CallToolResult;
  debugState(sessionId: string, session: DebugSession): Promise<CallToolResult>;
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
  ): CallToolResult;
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
  }): CallToolResult;
  runningSession(
    sessionId: string,
    platform: string,
    target: string,
  ): CallToolResult;
  terminatedSession(sessionId: string, message: string): CallToolResult;
  stackTrace(
    sessionId: string,
    session: DebugSession,
    stackTrace: Array<{
      frameId: number;
      functionName: string;
      file: string;
      line: number;
      column?: number;
      origin?: CodeOrigin;
      relativePath?: string;
    }>,
  ): CallToolResult;
  variables(
    sessionId: string,
    frameId: number,
    data: {
      path: string;
      result: unknown;
    },
  ): CallToolResult;
  evaluation(
    sessionId: string,
    evaluation: {
      expression?: string;
      result: unknown;
      type: string;
      error?: string;
    },
  ): CallToolResult;
}

/**
 * Session validation utilities - eliminates DRY violations
 */
export interface ISessionValidator {
  validateSession(
    sessionId: string,
  ): { session: DebugSession } | { error: CallToolResult };
  validatePausedSession(
    sessionId: string,
  ): { session: DebugSession } | { error: CallToolResult };
  createHandlerError(
    sessionId: string,
    error: unknown,
    operation?: string,
  ): CallToolResult;
}

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
    path: string;
    frameId?: number;
    maxDepth?: number;
  }): CallToolResult;
  stopMockSession(sessionId: string): CallToolResult;
}

/**
 * Mock session structure
 */
export interface MockDebugSession {
  request: DebugRequest;
  currentBreakpointIndex: number;
  events: Array<Record<string, unknown>>;
  startTime: string;
  consoleOutput: Array<{
    level: 'log' | 'debug' | 'info' | 'warn' | 'error' | 'trace';
    timestamp: string;
    message: string;
    args: unknown[];
  }>;
}

/**
 * CallToolResult interface - matches \@mcp-funnel/commands-core format
 */
export interface CallToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}
