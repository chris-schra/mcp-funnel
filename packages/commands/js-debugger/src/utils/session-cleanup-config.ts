import { SessionCleanupConfig } from '../types/index.js';

/**
 * Default cleanup configuration
 */
export const DEFAULT_CLEANUP_CONFIG: SessionCleanupConfig = {
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  heartbeatIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxConsoleOutputEntries: 1000,
  maxInactiveSessionsBeforeCleanup: 10,
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
  memoryThresholdBytes: 100 * 1024 * 1024, // 100MB
  enableHeartbeat: true,
  enableAutoCleanup: true,
};
