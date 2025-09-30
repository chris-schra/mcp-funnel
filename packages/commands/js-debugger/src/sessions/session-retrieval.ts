import {
  DebugSession,
  DebugState,
  IDebugSession,
  SessionLifecycleState,
} from '../types/index.js';
import { EnhancedDebugSession } from '../enhanced-debug-session.js';
import { SessionCompatibilityWrapper } from '../session-compatibility-wrapper.js';
import { SessionResourceTracker } from './resource-tracker.js';
import { SessionActivityTracker } from './activity-tracker.js';
import { TerminatedSessionManager } from './terminated-session-manager.js';
import { updateSessionActivity } from './session-utils.js';

/**
 * Context for session retrieval operations.
 *
 * @internal
 */
export interface SessionRetrievalContext {
  sessions: Map<string, EnhancedDebugSession>;
  compatibilitySessions: Map<string, SessionCompatibilityWrapper>;
  resourceTracker: SessionResourceTracker;
  activityTracker: SessionActivityTracker;
  terminatedSessionManager: TerminatedSessionManager;
}

/**
 * Retrieves a session by ID, returning the legacy DebugSession interface.
 *
 * Returns a compatibility wrapper for active sessions or a snapshot from terminated
 * session history. This method maintains backward compatibility with legacy code
 * expecting the old DebugSession interface. For new code, prefer {@link getEnhancedSession}.
 * @param context - Session retrieval context
 * @param id - Session ID (UUID)
 * @returns The session wrapped in compatibility interface, or undefined if not found
 * @example Retrieving active session
 * ```typescript
 * const session = getSession(context, sessionId);
 * if (session) {
 *   console.log(`Session state: ${session.state}`);
 * }
 * ```
 * @public
 * @see file:../session-compatibility-wrapper.ts - Legacy interface adapter
 * @see file:./terminated-session-manager.ts - Terminated session storage
 */
export function getSession(
  context: SessionRetrievalContext,
  id: string,
): DebugSession | undefined {
  const activeSession = context.compatibilitySessions.get(id);
  if (activeSession) {
    return activeSession;
  }

  return context.terminatedSessionManager.get(id);
}

/**
 * Retrieves an enhanced session by ID, returning the modern IDebugSession interface.
 *
 * Returns the new session-centered object with event-driven API and improved type safety.
 * Prefer this method over {@link getSession} for new code. Returns undefined for
 * terminated sessions (use {@link getSession} to access terminated session snapshots).
 * @param context - Session retrieval context
 * @param id - Session ID (UUID)
 * @returns The enhanced session object, or undefined if not active
 * @example Using enhanced session API
 * ```typescript
 * const session = getEnhancedSession(context, sessionId);
 * if (session) {
 *   // Event-driven API
 *   session.on('paused', (data) => console.log('Paused at', data.location));
 *   await session.continue();
 * }
 * ```
 * @public
 * @see file:../enhanced-debug-session.ts - Enhanced session implementation
 * @see file:../types/session.ts:56-92 - IDebugSession interface
 */
export function getEnhancedSession(
  context: SessionRetrievalContext,
  id: string,
): IDebugSession | undefined {
  return context.sessions.get(id);
}

/**
 * Retrieves a session and records user activity for cleanup tracking.
 *
 * Similar to {@link getSession} but automatically records user activity timestamp
 * and increments activity counter. This prevents the session from being considered
 * inactive during automatic cleanup cycles. Use this when user actions interact
 * with a session to keep it alive.
 * @param context - Session retrieval context
 * @param id - Session ID (UUID)
 * @returns The session with updated activity metadata, or undefined if not found
 * @example Activity-aware retrieval
 * ```typescript
 * // User continues execution - record activity
 * const session = getSessionWithActivity(context, sessionId);
 * if (session) {
 *   await session.adapter.continue();
 * }
 * ```
 * @internal
 * @see file:./session-utils.ts:42-55 - Activity update logic
 */
export function getSessionWithActivity(
  context: SessionRetrievalContext,
  id: string,
): DebugSession | undefined {
  const session = context.sessions.get(id);
  if (session) {
    // Record user activity when accessing session
    context.activityTracker.recordActivity(id, 'user_action');
    // Create a compatibility wrapper to avoid type issues
    const compatWrapper = context.compatibilitySessions.get(id);
    if (compatWrapper) {
      updateSessionActivity(
        compatWrapper,
        context.activityTracker.getActivityCount(id),
      );
      return compatWrapper;
    }
  }
  return undefined;
}

/**
 * Lists all currently active debug sessions with metadata.
 *
 * Returns an array of session summaries including platform, target, state,
 * and optional lifecycle/activity metadata. Does not include terminated sessions.
 * Used by list_sessions tool and cleanup operations to enumerate active sessions.
 * @param context - Session retrieval context
 * @returns Array of session summary objects with id, platform, target, state, and optional metadata
 * @example Listing sessions
 * ```typescript
 * const sessions = listSessions(context);
 * sessions.forEach(s => {
 *   console.log(`${s.id}: ${s.platform} ${s.target} - ${s.state}`);
 *   if (s.metadata) {
 *     console.log(`  Last activity: ${s.metadata.lastActivity}`);
 *   }
 * });
 * ```
 * @public
 */
export function listSessions(
  context: SessionRetrievalContext,
): Array<{
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
}> {
  return Array.from(context.sessions.values()).map((session) => ({
    id: session.id,
    platform: session.request.platform,
    target: session.request.target,
    state: session.state,
    startTime: session.startTime,
    metadata: session.metadata
      ? {
          lifecycleState: session.lifecycleState,
          lastActivity: session.metadata.lastActivityAt,
          resourceCount: context.resourceTracker.getResourceCount(session.id),
        }
      : undefined,
  }));
}
