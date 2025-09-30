import type {
  SessionCleanupConfig,
  SessionCleanupOptions,
} from '../types/index.js';
import type { EnhancedDebugSession } from '../enhanced-debug-session.js';
import type { SessionActivityTracker } from './activity-tracker.js';
import type { SessionResourceTracker } from './resource-tracker.js';

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

/**
 * Cleanup manager context
 */
export interface CleanupManagerContext {
  sessions: Map<string, EnhancedDebugSession>;
  activityTracker: SessionActivityTracker;
  resourceTracker: SessionResourceTracker;
  deleteSession: (sessionId: string) => Promise<void>;
  isShuttingDown: boolean;
}

/**
 * Cleanup manager for session lifecycle management
 */
export class CleanupManager {
  private config: SessionCleanupConfig;
  private globalCleanupTimer?: NodeJS.Timeout;
  private readonly context: CleanupManagerContext;

  constructor(
    context: CleanupManagerContext,
    config?: Partial<SessionCleanupConfig>,
  ) {
    this.context = context;
    this.config = { ...DEFAULT_CLEANUP_CONFIG, ...config };
  }

  /**
   * Initialize cleanup mechanisms and timers
   */
  initialize(): void {
    if (this.config.enableAutoCleanup) {
      this.globalCleanupTimer = setInterval(
        () => this.performGlobalCleanup(),
        this.config.cleanupIntervalMs,
      );

      // Ensure cleanup timer doesn't prevent process exit
      this.globalCleanupTimer.unref();
    }
  }

  /**
   * Get current cleanup configuration
   */
  getConfig(): SessionCleanupConfig {
    return { ...this.config };
  }

  /**
   * Update cleanup configuration
   */
  setConfig(config: Partial<SessionCleanupConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart cleanup timer if interval changed
    if (config.cleanupIntervalMs && this.globalCleanupTimer) {
      clearInterval(this.globalCleanupTimer);
      if (this.config.enableAutoCleanup) {
        this.globalCleanupTimer = setInterval(
          () => this.performGlobalCleanup(),
          this.config.cleanupIntervalMs,
        );
        this.globalCleanupTimer.unref();
      }
    }
  }

  /**
   * Manual cleanup of inactive sessions
   */
  async cleanupInactiveSessions(
    options: SessionCleanupOptions = {},
  ): Promise<number> {
    const { force = false } = options;
    let cleanedCount = 0;
    const sessionsToCleanup: string[] = [];

    for (const [sessionId, session] of this.context.sessions) {
      const isInactive = !this.context.activityTracker.isSessionActive(
        sessionId,
        this.config.sessionTimeoutMs,
      );

      const hasExceededMemoryThreshold =
        session.metadata &&
        session.metadata.resourceUsage.memoryEstimate >
          this.config.memoryThresholdBytes;

      if (force || isInactive || hasExceededMemoryThreshold) {
        sessionsToCleanup.push(sessionId);
      }
    }

    for (const sessionId of sessionsToCleanup) {
      try {
        const logPrefix = force ? 'Force cleanup for' : 'Cleaning up inactive';
        console.info(`${logPrefix} session: ${sessionId}`);
        await this.context.deleteSession(sessionId);
        cleanedCount++;
      } catch (error) {
        console.warn(`Failed to cleanup session ${sessionId}:`, error);
      }
    }

    return cleanedCount;
  }

  /**
   * Perform global cleanup of all sessions
   */
  private async performGlobalCleanup(): Promise<void> {
    if (this.context.isShuttingDown) return;

    try {
      // Clean up inactive sessions
      await this.cleanupInactiveSessions();

      // Check for memory pressure and clean up if needed
      const totalSessions = this.context.sessions.size;
      if (totalSessions > this.config.maxInactiveSessionsBeforeCleanup) {
        console.info(
          `Too many sessions (${totalSessions}), forcing cleanup of oldest inactive`,
        );
        await this.forceCleanupOldestSessions(
          totalSessions - this.config.maxInactiveSessionsBeforeCleanup,
        );
      }

      // Cleanup orphaned resources in trackers
      this.cleanupOrphanedTrackerResources();
    } catch (error) {
      console.error('Error during global cleanup:', error);
    }
  }

  /**
   * Force cleanup of oldest sessions to prevent resource exhaustion
   */
  private async forceCleanupOldestSessions(count: number): Promise<void> {
    const sessionEntries = Array.from(this.context.sessions.entries()).sort(
      (a, b) => {
        const aLastActivity = a[1].metadata?.lastActivityAt || a[1].startTime;
        const bLastActivity = b[1].metadata?.lastActivityAt || b[1].startTime;
        return (
          new Date(aLastActivity).getTime() - new Date(bLastActivity).getTime()
        );
      },
    );

    for (let i = 0; i < count && i < sessionEntries.length; i++) {
      const [sessionId] = sessionEntries[i];
      console.info(`Force cleaning up old session: ${sessionId}`);
      await this.context.deleteSession(sessionId);
    }
  }

  /**
   * Clean up orphaned resources in trackers
   */
  private cleanupOrphanedTrackerResources(): void {
    // This would clean up tracker resources for sessions that no longer exist
    // Implementation depends on tracker internal structure
  }

  /**
   * Shutdown cleanup manager
   */
  async shutdown(): Promise<void> {
    // Stop global cleanup timer
    if (this.globalCleanupTimer) {
      clearInterval(this.globalCleanupTimer);
      this.globalCleanupTimer = undefined;
    }
  }
}
