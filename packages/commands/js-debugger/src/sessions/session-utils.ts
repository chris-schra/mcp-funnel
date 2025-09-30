import type {
  ConsoleMessage,
  DebugRequest,
  DebugSession,
  DebugState,
  SessionLifecycleState,
} from '../types/index.js';
import type { EnhancedDebugSession } from '../enhanced-debug-session.js';

/**
 * Console message verbosity levels for filtering.
 *
 * Maps from user-facing verbosity settings to numeric priority levels.
 * Lower numbers mean more restrictive filtering (fewer messages shown).
 * @internal
 */
const VERBOSITY_LEVELS = {
  none: 0,
  'error-only': 1,
  'warn-error': 2,
  all: 3,
} as const;

/**
 * Console level priority mapping for filtering.
 *
 * Maps console message levels to numeric priorities for comparison.
 * Lower numbers indicate higher priority (more important messages).
 * Errors are highest priority (1), while info/log/debug/trace are lowest (3).
 * @internal
 */
const CONSOLE_LEVEL_PRIORITY = {
  error: 1,
  warn: 2,
  info: 3,
  log: 3,
  debug: 3,
  trace: 3,
} as const;

/**
 * Determines if a console message should be included based on verbosity level.
 *
 * Filters console messages by comparing the message's level priority against
 * the configured verbosity threshold. A message is included if its priority
 * is less than or equal to the verbosity level (lower priority numbers mean
 * more important messages).
 * @param message - Console message to evaluate for inclusion
 * @param verbosity - Verbosity filter level, defaults to 'all' (show everything)
 * @returns True if the message should be included in output, false otherwise
 * @example Filtering by verbosity
 * ```typescript
 * const errorMsg: ConsoleMessage = { level: 'error', ... };
 * const debugMsg: ConsoleMessage = { level: 'debug', ... };
 *
 * shouldIncludeConsoleMessage(errorMsg, 'error-only'); // true
 * shouldIncludeConsoleMessage(debugMsg, 'error-only'); // false
 * shouldIncludeConsoleMessage(debugMsg, 'all'); // true
 * ```
 * @public
 * @see file:../types/console.ts:3 - ConsoleMessage type definition
 * @see file:../types/request.ts:16 - consoleVerbosity values
 */
export function shouldIncludeConsoleMessage(
  message: ConsoleMessage,
  verbosity: DebugRequest['consoleVerbosity'] = 'all',
): boolean {
  const verbosityLevel = VERBOSITY_LEVELS[verbosity];
  const messageLevel = CONSOLE_LEVEL_PRIORITY[message.level];

  return messageLevel <= verbosityLevel;
}

/**
 * Estimates approximate memory usage for a debug session in bytes.
 *
 * Provides a rough estimate of memory consumed by a session's runtime data structures,
 * including console output, breakpoints, and metadata. This is used for cleanup decisions
 * and resource monitoring, not for precise memory accounting.
 *
 * The estimation formula:
 * - Base overhead: 1KB per session
 * - Console messages: ~200 bytes each
 * - Breakpoints: ~100 bytes each
 * - Metadata: ~512 bytes if present
 * @param session - Debug session to estimate memory usage for
 * @returns Estimated memory usage in bytes
 * @example Memory-based cleanup decisions
 * ```typescript
 * const session = manager.getSession(sessionId);
 * const memoryUsage = estimateSessionMemoryUsage(session);
 *
 * if (memoryUsage > 10 * 1024 * 1024) { // 10MB threshold
 *   console.warn('Session using excessive memory:', sessionId);
 * }
 * ```
 * @remarks
 * This is a heuristic estimate, not actual heap measurement. Actual memory usage
 * may vary based on adapter implementation, runtime overhead, and V8 internals.
 * The constants were chosen as reasonable averages for typical debugging scenarios.
 * @public
 * @see file:../types/session.ts:36 - DebugSession interface
 * @see file:./cleanup-manager.ts - Memory-based cleanup logic
 */
export function estimateSessionMemoryUsage(session: DebugSession): number {
  let memoryEstimate = 0;

  // Base session overhead
  memoryEstimate += 1024; // 1KB base

  // Console output estimate
  memoryEstimate += session.consoleOutput.length * 200; // ~200 bytes per message

  // Breakpoints estimate
  memoryEstimate += session.breakpoints.size * 100; // ~100 bytes per breakpoint

  // Metadata estimate
  if (session.metadata) {
    memoryEstimate += 512; // ~512 bytes for metadata
  }

  return memoryEstimate;
}

/**
 * Creates an immutable snapshot of a session for post-termination tracking.
 *
 * Produces a deep copy of session state with lifecycle forcibly set to 'terminated'
 * and cleanup handles removed. This snapshot preserves console output, breakpoints,
 * and metadata for debugging history while ensuring no active cleanup timers remain.
 *
 * The snapshot:
 * - Clones collections (breakpoints Map, consoleOutput array) to prevent mutation
 * - Shallow copies metadata object (assumes no nested mutable state)
 * - Removes cleanup handles (timeouts would be invalid after termination)
 * - Sets both state.status and lifecycleState to 'terminated'
 * @param session - Active or terminating session to snapshot
 * @returns Immutable snapshot with terminated lifecycle state
 * @example Preserving session history after cleanup
 * ```typescript
 * // Before cleanup, capture final state
 * const snapshot = createSessionSnapshot(activeSession);
 * terminatedSessionManager.store(snapshot);
 *
 * // Original session can now be safely destroyed
 * await cleanupSession(activeSession);
 *
 * // History remains queryable
 * const history = terminatedSessionManager.get(sessionId);
 * ```
 * @remarks
 * This performs shallow copying of metadata. If metadata contains nested objects
 * that may be mutated, consider deep cloning. Currently metadata structure is flat
 * (primitives and simple objects), so shallow copy is sufficient.
 * @public
 * @see file:../session-manager.ts:446 - Usage in session termination flow
 * @see file:./terminated-session-manager.ts - Snapshot storage
 */
export function createSessionSnapshot(session: DebugSession): DebugSession {
  return {
    ...session,
    breakpoints: new Map(session.breakpoints),
    consoleOutput: [...session.consoleOutput],
    state: { status: 'terminated' },
    lifecycleState: 'terminated' as SessionLifecycleState,
    metadata: session.metadata ? { ...session.metadata } : undefined,
    cleanup: undefined,
  };
}

/**
 * Updates session activity metadata to prevent premature cleanup.
 *
 * Mutates the session's metadata to record current timestamp and activity count.
 * This signals to cleanup managers that the session is actively used and should
 * not be considered idle. Only updates if metadata exists; silently no-ops otherwise.
 * @param session - Session to update (mutated in place)
 * @param activityCount - New cumulative activity count from activity tracker
 * @example Recording user activity
 * ```typescript
 * // User continues execution
 * const session = manager.getSession(sessionId);
 * activityTracker.recordActivity(sessionId, 'user_action');
 *
 * updateSessionActivity(
 *   session,
 *   activityTracker.getActivityCount(sessionId)
 * );
 * // Now session.metadata.lastActivityAt is current timestamp
 * ```
 * @remarks
 * This function performs side effects (mutation). It's designed for use in
 * session access paths where activity tracking is implicit (like getSessionWithActivity).
 * If metadata is undefined (legacy sessions or not yet initialized), the function
 * does nothing rather than throwing.
 * @public
 * @see file:../session-manager.ts:487 - Called in getSessionWithActivity
 * @see file:../types/session.ts:13 - SessionMetadata structure
 */
export function updateSessionActivity(
  session: DebugSession,
  activityCount: number,
): void {
  if (session.metadata) {
    const now = new Date().toISOString();
    session.metadata.lastActivityAt = now;
    session.metadata.activityCount = activityCount;
  }
}

/**
 * Creates a session information object for listing and monitoring.
 *
 * Extracts key information from an enhanced debug session into a plain object
 * suitable for serialization, display, or API responses. This is used by session
 * managers to provide snapshots of active sessions without exposing internal state.
 * @param session - Enhanced debug session to extract information from
 * @returns Plain object containing session metadata and current state
 * @example Listing sessions
 * ```typescript
 * const sessions = Array.from(sessionMap.values());
 * const sessionInfos = sessions.map(createSessionInfo);
 * console.log(JSON.stringify(sessionInfos, null, 2));
 * ```
 * @public
 * @see file:../lightweight-session-manager.ts:278 - Used in listSessions method
 * @see file:../enhanced-debug-session.ts - EnhancedDebugSession interface
 */
export function createSessionInfo(session: EnhancedDebugSession): {
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
} {
  return {
    id: session.id,
    platform: session.request.platform,
    target: session.request.target,
    state: session.state,
    startTime: session.startTime,
    metadata: {
      lifecycleState: session.lifecycleState,
      lastActivity: session.metadata.lastActivityAt,
      resourceCount: 0, // Not tracking resources in lightweight version
    },
  };
}
