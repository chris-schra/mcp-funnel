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

/**
 * Options for manual or forced session cleanup requests
 */
export interface SessionCleanupOptions {
  force?: boolean;
}

/**
 * Session activity tracker
 */
export interface ISessionActivityTracker {
  recordActivity(
    sessionId: string,
    type: 'user_action' | 'console_output' | 'state_change' | 'heartbeat',
  ): void;
  getLastActivity(sessionId: string): string | undefined;
  getActivityCount(sessionId: string): number;
  isSessionActive(sessionId: string, thresholdMs: number): boolean;
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
 * Session activity tracker (renamed from SessionActivity to avoid confusion)
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
