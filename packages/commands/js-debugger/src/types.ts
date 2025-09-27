export type CodeOrigin = 'user' | 'internal' | 'library' | 'unknown';

export interface DebugLocation {
  type: CodeOrigin;
  file?: string;
  line?: number;
  column?: number;
  description?: string;
  relativePath?: string;
}

export interface BreakpointLocation {
  file: string;
  line: number;
  column: number | undefined;
}

export interface BreakpointRegistration {
  id: string;
  verified: boolean;
  resolvedLocations?: BreakpointLocation[];
}

export interface IDebugAdapter {
  connect(target: string): Promise<void>;
  disconnect(): Promise<void>;
  setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration>;
  removeBreakpoint(id: string): Promise<void>;
  continue(): Promise<DebugState>;
  stepOver(): Promise<DebugState>;
  stepInto(): Promise<DebugState>;
  stepOut(): Promise<DebugState>;
  evaluate(expression: string): Promise<EvaluationResult>;
  getStackTrace(): Promise<StackFrame[]>;
  getScopes(frameId: number): Promise<Scope[]>;
  onConsoleOutput(handler: ConsoleHandler): void;
  onPaused(handler: PauseHandler): void;
  onResumed(handler: ResumeHandler): void;
  onBreakpointResolved?(
    handler: (registration: BreakpointRegistration) => void,
  ): void;
}

export interface DebugState {
  status: 'running' | 'paused' | 'terminated';
  pauseReason?: 'breakpoint' | 'step' | 'exception' | 'entry' | 'debugger';
  breakpoint?: BreakpointInfo;
  exception?: ExceptionInfo;
  location?: DebugLocation;
  hint?: string;
}

export interface BreakpointInfo {
  id: string;
  file: string;
  line: number;
  condition?: string;
  verified: boolean;
  resolvedLocations?: BreakpointLocation[];
}

export interface BreakpointStatusEntry {
  file: string;
  line: number;
  condition?: string;
  verified: boolean;
  resolvedLocations?: BreakpointLocation[];
  status?: 'not-registered' | 'pending';
  message?: string;
}

export interface BreakpointStatusSummary {
  requested: number;
  set: number;
  pending: BreakpointStatusEntry[];
}

export interface ExceptionInfo {
  message: string;
  stack?: string;
  uncaught: boolean;
}

export interface StackFrame {
  id: number;
  functionName: string;
  file: string;
  line: number;
  column?: number;
  origin?: CodeOrigin;
  relativePath?: string;
}

export interface Scope {
  type: 'global' | 'local' | 'closure' | 'with' | 'catch';
  name?: string;
  variables: Variable[];
}

export interface Variable {
  name: string;
  value: unknown;
  type: string;
  configurable?: boolean;
  enumerable?: boolean;
}

export interface EvaluationResult {
  value: unknown;
  type: string;
  description?: string;
  error?: string;
}

export interface ConsoleMessage {
  level: 'log' | 'debug' | 'info' | 'warn' | 'error' | 'trace';
  timestamp: string;
  message: string;
  args: unknown[];
  stackTrace?: StackFrame[];
}

export type ConsoleHandler = (message: ConsoleMessage) => void;
export type PauseHandler = (state: DebugState) => void;
export type ResumeHandler = () => void;

export interface DebugRequest {
  platform: 'node' | 'browser';
  target: string;
  command?: string; // Runtime command for Node (e.g., "node", "tsx", "ts-node")
  args?: string[]; // Additional CLI arguments passed to the script when launching Node runtime
  breakpoints?: Array<{
    file: string;
    line: number;
    condition?: string;
  }>;
  timeout?: number;
  evalExpressions?: string[];
  captureConsole?: boolean;
  consoleVerbosity?: 'all' | 'warn-error' | 'error-only' | 'none';
}

/**
 * Session metadata for tracking activity and resource usage
 */
export interface SessionMetadata {
  createdAt: string;
  lastActivityAt: string;
  lastHeartbeatAt?: string;
  activityCount: number;
  resourceUsage: {
    consoleOutputSize: number;
    memoryEstimate: number;
  };
}

/**
 * Session lifecycle state (separate from debug execution state)
 */
export type SessionLifecycleState =
  | 'initializing'
  | 'connected'
  | 'active'
  | 'inactive'
  | 'terminating'
  | 'terminated';

/**
 * Cleanup configuration for session management
 */
export interface SessionCleanupConfig {
  sessionTimeoutMs: number; // default 30 minutes (1800000)
  heartbeatIntervalMs: number; // default 5 minutes (300000)
  maxConsoleOutputEntries: number; // default 1000
  maxInactiveSessionsBeforeCleanup: number; // default 10
  cleanupIntervalMs: number; // default 5 minutes (300000)
  memoryThresholdBytes: number; // default 100MB (104857600)
  enableHeartbeat: boolean; // default true
  enableAutoCleanup: boolean; // default true
}

export interface DebugSession {
  id: string;
  adapter: IDebugAdapter;
  request: DebugRequest;
  breakpoints: Map<string, BreakpointInfo>;
  state: DebugState;
  startTime: string;
  consoleOutput: ConsoleMessage[];
  // Enhanced cleanup and lifecycle management
  metadata?: SessionMetadata;
  lifecycleState?: SessionLifecycleState;
  cleanup?: {
    timeoutHandle?: NodeJS.Timeout;
    heartbeatHandle?: NodeJS.Timeout;
    resources: Set<string>; // track resource IDs for cleanup
  };
}

/**
 * Resource tracker for monitoring and cleanup
 */
export interface ResourceTracker {
  trackResource(
    sessionId: string,
    resourceId: string,
    type: 'process' | 'connection' | 'timer',
  ): void;
  releaseResource(sessionId: string, resourceId: string): void;
  getResourceCount(sessionId: string): number;
  getAllResources(sessionId: string): Array<{ id: string; type: string }>;
}

/**
 * Session activity tracker
 */
export interface SessionActivity {
  recordActivity(
    sessionId: string,
    type: 'user_action' | 'console_output' | 'state_change' | 'heartbeat',
  ): void;
  getLastActivity(sessionId: string): string | undefined;
  getActivityCount(sessionId: string): number;
  isSessionActive(sessionId: string, thresholdMs: number): boolean;
}

export interface ISessionManager {
  createSession(request: DebugRequest): Promise<string>;
  getSession(id: string): DebugSession | undefined;
  deleteSession(id: string): void;
  listSessions(): Array<{
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
  }>;
  // Enhanced cleanup methods
  cleanupInactiveSessions?(): Promise<number>;
  getCleanupConfig?(): SessionCleanupConfig;
  setCleanupConfig?(config: Partial<SessionCleanupConfig>): void;
  waitForPause(
    sessionId: string,
    timeoutMs?: number,
  ): Promise<DebugSession | undefined>;
}

export interface ICDPClient {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  on(event: string, handler: (params: unknown) => void): void;
  off(event: string, handler: (params: unknown) => void): void;
}

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
    level: 'log' | 'debug' | 'info' | 'warn' | 'error';
    timestamp: string;
    message: string;
    args: unknown[];
  }>;
}

/**
 * CallToolResult interface - matches @mcp-funnel/commands-core format
 */
export interface CallToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}
