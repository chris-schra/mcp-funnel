import type { DebugSession } from '../types/index.js';

/**
 * Manager for tracking terminated sessions temporarily
 */
export class TerminatedSessionManager {
  private terminatedSessions = new Map<
    string,
    { session: DebugSession; expiresAt: number }
  >();

  /**
   * Store a terminated session temporarily
   */
  store(session: DebugSession, retentionMs = 60000): void {
    const expiresAt = Date.now() + retentionMs;
    this.terminatedSessions.set(session.id, { session, expiresAt });
    this.cleanupExpired();
  }

  /**
   * Get a terminated session if it hasn't expired
   */
  get(id: string): DebugSession | undefined {
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
   * Cleanup expired terminated sessions
   */
  cleanupExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.terminatedSessions.entries()) {
      if (entry.expiresAt < now) {
        this.terminatedSessions.delete(id);
      }
    }
  }

  /**
   * Clear all terminated sessions
   */
  clear(): void {
    this.terminatedSessions.clear();
  }
}
