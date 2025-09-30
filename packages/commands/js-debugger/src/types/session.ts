import type { DebugRequest } from './request.js';
import type { DebugState } from './debug-state.js';
import type { BreakpointInfo, BreakpointRegistration } from './breakpoint.js';
import type { ConsoleMessage } from './console.js';
import type { EvaluationResult, StackFrame, Scope } from './evaluation.js';
import type { DebugSessionEvents } from './events.js';
import type { IDebugAdapter } from './adapter.js';
import type { SessionCleanupConfig, SessionCleanupOptions } from './cleanup.js';

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

// Legacy DebugSession interface for backward compatibility
export interface DebugSession {
  id: string;
  adapter: Omit<IDebugAdapter, 'continue'>;
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
  // Optional method to get the enhanced session for advanced operations
  getEnhancedSession?(): unknown; // Returns enhanced session type
}

export interface IDebugSession {
  readonly id: string;
  readonly request: DebugRequest;
  readonly startTime: string;
  readonly state: DebugState;
  readonly lifecycleState: SessionLifecycleState;
  readonly metadata: SessionMetadata;
  readonly breakpoints: ReadonlyMap<string, BreakpointInfo>;
  readonly consoleOutput: readonly ConsoleMessage[];

  // Session control methods
  waitForPause(timeoutMs?: number): Promise<DebugState>;
  continue(): Promise<DebugState>;
  stepOver(): Promise<DebugState>;
  stepInto(): Promise<DebugState>;
  stepOut(): Promise<DebugState>;
  evaluate(expression: string): Promise<EvaluationResult>;
  setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration>;
  removeBreakpoint(id: string): Promise<void>;
  getStackTrace(): Promise<StackFrame[]>;
  getScopes(frameId: number): Promise<Scope[]>;
  terminate(): Promise<void>;

  // Event-driven interface using Emittery
  on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void;
  off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void;
}

export interface ISessionManager {
  createSession(request: DebugRequest): Promise<IDebugSession>;
  getSession(id: string): DebugSession | undefined;
  getEnhancedSession?(id: string): IDebugSession | undefined;
  deleteSession(id: string): Promise<void>;
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
  cleanupInactiveSessions?(options?: SessionCleanupOptions): Promise<number>;
  getCleanupConfig?(): SessionCleanupConfig;
  setCleanupConfig?(config: Partial<SessionCleanupConfig>): void;
  waitForPause(
    sessionId: string,
    timeoutMs?: number,
  ): Promise<DebugSession | undefined>;
}
