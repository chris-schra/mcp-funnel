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
