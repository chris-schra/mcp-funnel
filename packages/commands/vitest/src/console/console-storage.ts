import { LRUCache } from 'lru-cache';
import type { ParsedConsoleEntry, ConsoleQuery, ConsoleStats } from '../types/index.js';

/**
 * Configuration for ConsoleStorage
 */
export interface ConsoleStorageConfig {
  /** Maximum total entries across all sessions */
  maxEntries: number;

  /** Time-to-live for entries in milliseconds */
  ttl: number;

  /** Maximum entries per session */
  maxEntriesPerSession: number;
}

/**
 * Storage for console entries with LRU+TTL eviction
 *
 * Features:
 * - LRU eviction when maxEntries is reached
 * - TTL-based automatic expiration
 * - Per-session entry limits with oldest-first eviction
 * - Efficient querying with filtering
 */
export class ConsoleStorage {
  private cache: LRUCache<string, ParsedConsoleEntry>;
  private sessionCounts: Map<string, number>;
  private config: ConsoleStorageConfig;

  public constructor(config: ConsoleStorageConfig) {
    this.config = config;
    this.sessionCounts = new Map();

    this.cache = new LRUCache<string, ParsedConsoleEntry>({
      max: config.maxEntries,
      ttl: config.ttl,
      ttlAutopurge: true, // Eager eviction for expired entries
      dispose: (entry, _key) => {
        // Decrement session count when entry is evicted
        this.decrementSessionCount(entry.sessionId);
      },
    });
  }

  /**
   * Add a console entry to storage
   *
   * Enforces per-session entry limits by evicting oldest entries when limit is reached
   * @param sessionId - Session identifier
   * @param entry - Console entry to add
   */
  public add(sessionId: string, entry: ParsedConsoleEntry): void {
    // Enforce per-session limit
    const currentCount = this.sessionCounts.get(sessionId) || 0;
    if (currentCount >= this.config.maxEntriesPerSession) {
      // Evict oldest entry for this session
      this.evictOldestForSession(sessionId);
    }

    // Add new entry
    const key = this.makeKey(sessionId, entry.id);
    this.cache.set(key, entry);

    // Increment session count
    this.sessionCounts.set(sessionId, (this.sessionCounts.get(sessionId) || 0) + 1);
  }

  /**
   * Query console entries with filtering
   *
   * @param sessionId - Session to query
   * @param filter - Query filters
   * @returns Matching entries (sorted by timestamp ascending)
   */
  public query(sessionId: string, filter: ConsoleQuery): ParsedConsoleEntry[] {
    const entries: ParsedConsoleEntry[] = [];

    // Iterate all entries and filter
    for (const [_key, entry] of this.cache.entries()) {
      if (entry.sessionId !== sessionId) {
        continue;
      }

      // Apply filters
      if (!this.matchesFilter(entry, filter)) {
        continue;
      }

      entries.push(entry);
    }

    // Sort by timestamp ascending
    entries.sort((a, b) => a.timestamp - b.timestamp);

    // Apply pagination
    const skip = filter.skip || 0;
    const limit = filter.limit || entries.length;

    return entries.slice(skip, skip + limit);
  }

  /**
   * Get statistics for a session
   * @param sessionId - Session identifier
   * @returns Statistics object with total count and per-stream counts
   */
  public getStats(sessionId: string): ConsoleStats {
    let total = 0;
    let stdout = 0;
    let stderr = 0;

    for (const entry of this.cache.values()) {
      if (entry.sessionId === sessionId) {
        total++;
        if (entry.type === 'stdout') {
          stdout++;
        } else {
          stderr++;
        }
      }
    }

    return {
      total,
      byStream: { stdout, stderr },
    };
  }

  /**
   * Clear all entries for a session
   * @param sessionId - Session identifier
   */
  public clearSession(sessionId: string): void {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.sessionId === sessionId) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    this.sessionCounts.delete(sessionId);
  }

  // --- Private methods ---

  private makeKey(sessionId: string, entryId: number): string {
    return `${sessionId}:${entryId}`;
  }

  private decrementSessionCount(sessionId: string): void {
    const count = this.sessionCounts.get(sessionId);
    if (count !== undefined) {
      if (count <= 1) {
        this.sessionCounts.delete(sessionId);
      } else {
        this.sessionCounts.set(sessionId, count - 1);
      }
    }
  }

  private evictOldestForSession(sessionId: string): void {
    let oldestEntry: ParsedConsoleEntry | undefined;
    let oldestKey: string | undefined;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.sessionId === sessionId) {
        if (!oldestEntry || entry.timestamp < oldestEntry.timestamp) {
          oldestEntry = entry;
          oldestKey = key;
        }
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private matchesFilter(entry: ParsedConsoleEntry, filter: ConsoleQuery): boolean {
    return (
      this.matchesStreamType(entry, filter) &&
      this.matchesTaskFilter(entry, filter) &&
      this.matchesTimeRange(entry, filter) &&
      this.matchesSearchFilter(entry, filter)
    );
  }

  private matchesStreamType(entry: ParsedConsoleEntry, filter: ConsoleQuery): boolean {
    if (filter.streamType && filter.streamType !== 'both') {
      return entry.type === filter.streamType;
    }
    return true;
  }

  private matchesTaskFilter(entry: ParsedConsoleEntry, filter: ConsoleQuery): boolean {
    // Task ID filter
    if (filter.taskId !== undefined && entry.taskId !== filter.taskId) {
      return false;
    }

    // Test file filter (substring match)
    if (
      filter.testFile !== undefined &&
      (!entry.testFile || !entry.testFile.includes(filter.testFile))
    ) {
      return false;
    }

    // Test name filter (substring match)
    if (
      filter.testName !== undefined &&
      (!entry.testName || !entry.testName.includes(filter.testName))
    ) {
      return false;
    }

    return true;
  }

  private matchesTimeRange(entry: ParsedConsoleEntry, filter: ConsoleQuery): boolean {
    // After filter
    if (filter.after !== undefined && entry.timestamp < filter.after) {
      return false;
    }

    // Before filter
    if (filter.before !== undefined && entry.timestamp > filter.before) {
      return false;
    }

    return true;
  }

  private matchesSearchFilter(entry: ParsedConsoleEntry, filter: ConsoleQuery): boolean {
    if (filter.search !== undefined) {
      return this.messageMatchesSearch(
        entry.message,
        filter.search,
        filter.useRegex || false,
        filter.caseSensitive || false,
      );
    }
    return true;
  }

  private messageMatchesSearch(
    message: string,
    search: string,
    useRegex: boolean,
    caseSensitive: boolean,
  ): boolean {
    if (useRegex) {
      try {
        const flags = caseSensitive ? '' : 'i';
        const regex = new RegExp(search, flags);
        return regex.test(message);
      } catch {
        // Invalid regex, fall back to literal search
        return this.literalSearch(message, search, caseSensitive);
      }
    } else {
      return this.literalSearch(message, search, caseSensitive);
    }
  }

  private literalSearch(message: string, search: string, caseSensitive: boolean): boolean {
    if (!caseSensitive) {
      return message.toLowerCase().includes(search.toLowerCase());
    } else {
      return message.includes(search);
    }
  }
}
