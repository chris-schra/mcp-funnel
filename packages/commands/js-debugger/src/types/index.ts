import type { DebugState } from './DebugState.js';
import type { ConsoleMessage } from './ConsoleMessage.js';

export * from './BreakpointInfo.js';
export * from './CallToolResult.js';
export * from './ConsoleMessage.js';
export * from './DebugRequest.js';
export * from './DebugSession.js';
export * from './DebugState.js';
export * from './EvaluationResult.js';
export * from './ExceptionInfo.js';
export * from './ICDPClient.js';
export * from './IDebugAdapter.js';
export * from './IMockSessionManager.js';
export * from './IResponseFormatter.js';
export * from './ISessionManager.js';
export * from './ISessionValidator.js';
export * from './IToolHandler.js';
export * from './MockDebugSession.js';
export * from './Scope.js';
export * from './SessionCleanupConfig.js';
export * from './SessionLifecycleState.js';
export * from './SessionMetadata.js';
export * from './StackFrame.js';
export * from './ToolHandlerContext.js';
export * from './Variable.js';

export type ConsoleHandler = (message: ConsoleMessage) => void;
export type PauseHandler = (state: DebugState) => void;
export type ResumeHandler = () => void;

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
