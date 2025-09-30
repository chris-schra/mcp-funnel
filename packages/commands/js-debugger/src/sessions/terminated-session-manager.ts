import type { DebugSession } from '../types/index.js';

/**
 * Manages temporary storage of terminated debug sessions for historical lookups.
 *
 * Provides a time-bounded cache of terminated sessions, allowing queries for
 * session state after termination. Sessions are automatically expired after
 * the retention period to prevent memory leaks.
 *
 * Use cases:
 * - Retrieving final session state during async cleanup operations
 * - Supporting historical queries in waitForPause when sessions terminate early
 * - Debugging and logging post-termination session information
 * @example Basic usage
 * ```typescript
 * const manager = new TerminatedSessionManager();
 *
 * // Store terminated session with 60s retention (default)
 * manager.store(terminatedSession);
 *
 * // Retrieve within retention window
 * const session = manager.get('session-id');
 * if (session) {
 *   console.log(`Final state: ${session.state.status}`);
 * }
 * ```
 * @example Custom retention period
 * ```typescript
 * // Store with 5-minute retention
 * manager.store(session, 5 * 60 * 1000);
 *
 * // Clear all terminated sessions manually
 * manager.clear();
 * ```
 * @internal
 * @see file:./wait-for-pause.ts:32 - Usage in waitForPause fallback lookup
 * @see file:../session-manager.ts:447 - Storing snapshots during cleanup
 */
export class TerminatedSessionManager {
  private terminatedSessions = new Map<
    string,
    { session: DebugSession; expiresAt: number }
  >();

  /**
   * Stores a terminated session with time-bounded retention.
   *
   * Sessions are automatically expired when retrieved after the retention period.
   * Each store operation triggers cleanup of expired entries.
   * @param session - The terminated session to store (must have session.id)
   * @param retentionMs - Time in milliseconds to retain the session (default: 60000)
   * @example
   * ```typescript
   * // Store with default 60s retention
   * manager.store(terminatedSession);
   *
   * // Store with custom 5-minute retention
   * manager.store(terminatedSession, 5 * 60 * 1000);
   * ```
   * @internal
   */
  public store(session: DebugSession, retentionMs = 60000): void {
    const expiresAt = Date.now() + retentionMs;
    this.terminatedSessions.set(session.id, { session, expiresAt });
    this.cleanupExpired();
  }

  /**
   * Retrieves a terminated session by ID if still within retention period.
   *
   * Returns `undefined` if:
   * - No session exists with the given ID
   * - The session has expired (automatically removed on access)
   * @param id - Session identifier
   * @returns The terminated session, or undefined if not found or expired
   * @example
   * ```typescript
   * const session = manager.get('session-123');
   * if (session) {
   *   console.log(`Session terminated at: ${session.state.lastUpdate}`);
   * } else {
   *   console.log('Session not found or expired');
   * }
   * ```
   * @internal
   */
  public get(id: string): DebugSession | undefined {
    const entry = this.terminatedSessions.get(id);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt < Date.now()) {
      this.terminatedSessions.delete(id);
      return undefined;
    }

    return entry.session;
  }

  /**
   * Removes all expired sessions from storage.
   *
   * Iterates through all stored sessions and removes those whose retention
   * period has elapsed. Called automatically by {@link store} to prevent
   * unbounded memory growth.
   * @example
   * ```typescript
   * // Manually trigger cleanup
   * manager.cleanupExpired();
   * ```
   * @internal
   */
  public cleanupExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.terminatedSessions.entries()) {
      if (entry.expiresAt < now) {
        this.terminatedSessions.delete(id);
      }
    }
  }

  /**
   * Removes all terminated sessions from storage, regardless of expiration.
   *
   * Useful for testing, explicit cleanup during shutdown, or memory management.
   * @example
   * ```typescript
   * // Clear all terminated sessions
   * manager.clear();
   * ```
   * @internal
   */
  public clear(): void {
    this.terminatedSessions.clear();
  }
}
