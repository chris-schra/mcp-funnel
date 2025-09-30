import type {
  SessionCleanupConfig,
  SessionCleanupOptions,
} from '../types/index.js';
import type { EnhancedDebugSession } from '../enhanced-debug-session.js';
import type { SessionActivityTracker } from './activity-tracker.js';
import type { SessionResourceTracker } from './resource-tracker.js';

/**
 * Default cleanup configuration values for session lifecycle management.
 * @public
 * @see file:../types/cleanup.ts:4-13 - SessionCleanupConfig interface
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
 * Dependencies and state required for cleanup operations.
 *
 * Provides the CleanupManager access to session storage, activity tracking,
 * resource monitoring, and the ability to delete sessions.
 * @public
 * @see file:./activity-tracker.ts:6 - SessionActivityTracker implementation
 * @see file:./resource-tracker.ts:6 - SessionResourceTracker implementation
 */
export interface CleanupManagerContext {
  /** Active debug sessions managed by the system */
  sessions: Map<string, EnhancedDebugSession>;
  /** Tracks session activity timestamps for timeout detection */
  activityTracker: SessionActivityTracker;
  /** Monitors resource usage per session for memory threshold enforcement */
  resourceTracker: SessionResourceTracker;
  /** Callback to terminate and remove a session from the system */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Flag indicating system is shutting down, preventing new cleanup operations */
  isShuttingDown: boolean;
}

/**
 * Manages automatic and manual cleanup of inactive or resource-intensive debug sessions.
 *
 * The CleanupManager orchestrates session lifecycle by:
 * - Running periodic cleanup checks at configurable intervals
 * - Identifying sessions that exceed timeout thresholds
 * - Detecting sessions exceeding memory limits
 * - Force-cleaning oldest sessions when total count exceeds limits
 * - Managing cleanup timers that don't block process exit
 *
 * Cleanup is triggered by three criteria:
 * 1. Session inactivity exceeding `sessionTimeoutMs`
 * 2. Session memory usage exceeding `memoryThresholdBytes`
 * 3. Total session count exceeding `maxInactiveSessionsBeforeCleanup`
 * @example Basic usage
 * ```typescript
 * const cleanupManager = new CleanupManager({
 *   sessions: sessionMap,
 *   activityTracker,
 *   resourceTracker,
 *   deleteSession: async (id) => { await terminate(id); },
 *   isShuttingDown: false
 * });
 * cleanupManager.initialize();
 *
 * // Manual cleanup
 * const count = await cleanupManager.cleanupInactiveSessions();
 * console.log(`Cleaned ${count} sessions`);
 * ```
 * @example Custom configuration
 * ```typescript
 * const cleanupManager = new CleanupManager(
 *   context,
 *   {
 *     sessionTimeoutMs: 10 * 60 * 1000,  // 10 minutes
 *     maxInactiveSessionsBeforeCleanup: 5,
 *     enableAutoCleanup: true
 *   }
 * );
 * ```
 * @public
 * @see file:../session-manager.ts:128-140 - Used by SessionManager
 * @see file:../types/cleanup.ts:4-13 - SessionCleanupConfig interface
 */
export class CleanupManager {
  private config: SessionCleanupConfig;
  private globalCleanupTimer?: NodeJS.Timeout;
  private readonly context: CleanupManagerContext;

  public constructor(
    context: CleanupManagerContext,
    config?: Partial<SessionCleanupConfig>,
  ) {
    this.context = context;
    this.config = { ...DEFAULT_CLEANUP_CONFIG, ...config };
  }

  /**
   * Starts automatic cleanup timer if enabled in configuration.
   *
   * When `enableAutoCleanup` is true, sets up a periodic timer that calls
   * {@link performGlobalCleanup} at the interval specified by `cleanupIntervalMs`.
   * The timer is unref'd to prevent blocking process exit.
   * @public
   * @see file:./cleanup-manager.ts:136-159 - performGlobalCleanup implementation
   */
  public initialize(): void {
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
   * Returns a copy of the current cleanup configuration.
   * @returns {SessionCleanupConfig} Deep copy of configuration to prevent external mutation
   * @public
   */
  public getConfig(): SessionCleanupConfig {
    return { ...this.config };
  }

  /**
   * Updates cleanup configuration and restarts timer if interval changed.
   *
   * Merges the provided partial configuration with existing settings.
   * If `cleanupIntervalMs` is updated and auto-cleanup is enabled, clears
   * the existing timer and creates a new one with the updated interval.
   * @param {Partial<SessionCleanupConfig>} config - Partial configuration to merge with current settings
   * @public
   */
  public setConfig(config: Partial<SessionCleanupConfig>): void {
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
   * Identifies and removes sessions based on activity and resource criteria.
   *
   * Iterates through all sessions and deletes those matching any of:
   * - Inactivity exceeding `sessionTimeoutMs` (checked via activityTracker)
   * - Memory usage exceeding `memoryThresholdBytes`
   * - Force option is true (deletes all sessions)
   *
   * Failed deletions are logged as warnings but don't stop the cleanup process.
   * @param {SessionCleanupOptions} options - Cleanup behavior options
   * @returns {Promise<number>} Count of successfully cleaned sessions
   * @example Force cleanup all sessions
   * ```typescript
   * const count = await cleanupManager.cleanupInactiveSessions({ force: true });
   * ```
   * @example Normal cleanup based on timeouts
   * ```typescript
   * const count = await cleanupManager.cleanupInactiveSessions();
   * ```
   * @public
   * @see file:../session-manager.ts:617-621 - Called by SessionManager
   * @see file:../handlers/cleanup-sessions-handler.ts:159-161 - Used by cleanup tool
   */
  public async cleanupInactiveSessions(
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
   * Executes comprehensive cleanup checks on all sessions.
   *
   * Called automatically by the cleanup timer. Performs three operations:
   * 1. Cleans up inactive/high-memory sessions via {@link cleanupInactiveSessions}
   * 2. If total sessions exceed {@link SessionCleanupConfig.maxInactiveSessionsBeforeCleanup},
   * force-cleans oldest sessions to bring count under limit
   * 3. Removes orphaned resources from trackers
   *
   * Skips execution if system is shutting down. Logs errors but continues execution.
   * @internal
   * @see file:./cleanup-manager.ts:165-181 - forceCleanupOldestSessions implementation
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
   * Terminates the specified number of oldest sessions by last activity time.
   *
   * Sorts all sessions by `lastActivityAt` (or `startTime` if no activity recorded),
   * then deletes the oldest N sessions. Used when total session count exceeds limits
   * to prevent unbounded resource growth.
   * @param {number} count - Number of oldest sessions to remove
   * @internal
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
   * Removes tracker entries for sessions that no longer exist.
   *
   * Placeholder for cleaning up activityTracker and resourceTracker data
   * for sessions that have been deleted but left orphaned tracking entries.
   * Implementation depends on tracker internal structure.
   * @internal
   */
  private cleanupOrphanedTrackerResources(): void {
    // This would clean up tracker resources for sessions that no longer exist
    // Implementation depends on tracker internal structure
  }

  /**
   * Stops automatic cleanup timer and releases resources.
   *
   * Clears the global cleanup interval timer if running. Should be called
   * during system shutdown before terminating all sessions.
   * @public
   * @see file:../session-manager.ts:712 - Called during SessionManager shutdown
   */
  public async shutdown(): Promise<void> {
    // Stop global cleanup timer
    if (this.globalCleanupTimer) {
      clearInterval(this.globalCleanupTimer);
      this.globalCleanupTimer = undefined;
    }
  }
}
