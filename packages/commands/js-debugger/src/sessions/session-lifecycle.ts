import { randomUUID } from 'crypto';
import {
  DebugRequest,
  DebugSession,
  SessionCleanupConfig,
} from '../types/index.js';
import { EnhancedDebugSession } from '../enhanced-debug-session.js';
import { SessionCompatibilityWrapper } from '../session-compatibility-wrapper.js';
import { IAdapterFactory, setInitialBreakpoints } from './session-factory.js';
import { SessionResourceTracker } from './resource-tracker.js';
import { SessionActivityTracker } from './activity-tracker.js';
import { TerminatedSessionManager } from './terminated-session-manager.js';
import { createSessionSnapshot } from './session-utils.js';
import {
  cleanupEnhancedSession,
  setupEnhancedSessionTimeouts,
} from './session-cleanup-utils.js';

/**
 * Context for session lifecycle operations.
 *
 * @internal
 */
export interface SessionLifecycleContext {
  sessions: Map<string, EnhancedDebugSession>;
  compatibilitySessions: Map<string, SessionCompatibilityWrapper>;
  sessionTimeouts: Map<string, NodeJS.Timeout>;
  resourceTracker: SessionResourceTracker;
  activityTracker: SessionActivityTracker;
  terminatedSessionManager: TerminatedSessionManager;
  adapterFactory: IAdapterFactory;
  getCleanupConfig: () => SessionCleanupConfig;
}

/**
 * Creates a new debug session with automatic initialization and resource tracking.
 *
 * Generates a unique session ID, creates the appropriate platform adapter (Node.js or browser),
 * initializes the debug connection, sets initial breakpoints, and establishes timeout/heartbeat
 * mechanisms. The session is tracked for resource usage and activity monitoring.
 *
 * Process:
 * 1. Generate UUID and validate uniqueness
 * 2. Create platform-specific adapter via factory
 * 3. Initialize adapter connection (spawns process or connects to browser)
 * 4. Set initial breakpoints if specified
 * 5. Wrap in compatibility layer for legacy API support
 * 6. Register cleanup handlers for auto-termination
 * @param context - Session lifecycle context with trackers and configuration
 * @param request - Debug session configuration including platform, target, breakpoints, and timeout
 * @returns Promise resolving to the initialized debug session
 * @throws When session ID collision occurs (extremely rare with UUID)
 * @throws When adapter initialization fails (process spawn error, connection refused, etc.)
 * @throws When breakpoint registration fails during initialization
 * @example Node.js debugging
 * ```typescript
 * const session = await createDebugSession(context, {
 *   platform: 'node',
 *   target: './index.js',
 *   args: ['--experimental-modules'],
 *   breakpoints: [
 *     { file: './index.js', line: 15, condition: 'user.id === 123' }
 *   ],
 *   timeout: 30000
 * });
 * ```
 * @public
 * @see file:./session-factory.ts:40-65 - Adapter creation
 */
export async function createDebugSession(
  context: SessionLifecycleContext,
  request: DebugRequest,
): Promise<EnhancedDebugSession> {
  const sessionId = randomUUID();

  // Check for duplicate session creation (edge case protection)
  if (context.sessions.has(sessionId)) {
    throw new Error(`Session ID collision detected: ${sessionId}`);
  }

  const adapter = context.adapterFactory.createAdapter(
    request.platform,
    request,
  );
  const enhancedSession = new EnhancedDebugSession(sessionId, adapter, request);

  // Store session before initialization
  context.sessions.set(sessionId, enhancedSession);

  // Record session creation activity
  context.activityTracker.recordActivity(sessionId, 'state_change');

  try {
    // Track adapter connection as a resource
    context.resourceTracker.trackResource(
      sessionId,
      `adapter-${sessionId}`,
      'connection',
    );

    // Initialize the session (this handles adapter connection)
    await enhancedSession.initialize();

    // Set up enhanced timeout and heartbeat mechanisms
    const timeoutMs =
      request.timeout || context.getCleanupConfig().sessionTimeoutMs;
    setupEnhancedSessionTimeouts(
      enhancedSession,
      timeoutMs,
      context.resourceTracker,
    );

    // Set initial breakpoints if specified
    if (request.breakpoints) {
      await setInitialBreakpoints(enhancedSession, request.breakpoints);
    }

    // Create compatibility wrapper for backward compatibility
    const compatibilityWrapper = new SessionCompatibilityWrapper(
      enhancedSession,
    );
    context.compatibilitySessions.set(sessionId, compatibilityWrapper);

    // Auto-cleanup when session terminates
    enhancedSession.on('terminated', () => {
      context.sessions.delete(sessionId);
      context.compatibilitySessions.delete(sessionId);
      context.activityTracker.removeSession(sessionId);
    });

    context.activityTracker.recordActivity(sessionId, 'state_change');
  } catch (error) {
    // Clean up on initialization failure
    await deleteDebugSession(context, sessionId);
    throw new Error(
      `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  return enhancedSession;
}

/**
 * Deletes a session and performs comprehensive resource cleanup.
 *
 * Terminates the debug adapter connection, clears timeouts and heartbeat intervals,
 * releases tracked resources, removes from activity tracking, and stores a snapshot
 * in terminated session history. Accepts session ID, legacy DebugSession, enhanced
 * session, or compatibility wrapper.
 *
 * Cleanup operations:
 * - Terminates adapter connection (closes CDP websocket, kills spawned process)
 * - Clears session timeout and heartbeat timers
 * - Releases tracked resources (memory, connections)
 * - Removes from activity tracker
 * - Stores snapshot in terminated session manager
 * - Emits 'terminated' event for listeners
 * @param context - Session lifecycle context with trackers and configuration
 * @param idOrSession - Session ID string, DebugSession, or EnhancedDebugSession instance
 * @example Delete by ID
 * ```typescript
 * await deleteDebugSession(context, sessionId);
 * ```
 * @public
 * @see file:./session-cleanup-utils.ts:15-45 - Cleanup implementation
 */
export async function deleteDebugSession(
  context: SessionLifecycleContext,
  idOrSession: string | DebugSession | EnhancedDebugSession,
): Promise<void> {
  let sessionId: string;
  let enhancedSession: EnhancedDebugSession | undefined;

  if (typeof idOrSession === 'string') {
    sessionId = idOrSession;
    enhancedSession = context.sessions.get(sessionId);
  } else if ('getEnhancedSession' in idOrSession) {
    // It's a compatibility wrapper
    sessionId = idOrSession.id;
    enhancedSession = (
      idOrSession as SessionCompatibilityWrapper
    ).getEnhancedSession();
  } else if ('terminate' in idOrSession) {
    // It's an EnhancedDebugSession
    sessionId = idOrSession.id;
    enhancedSession = idOrSession as EnhancedDebugSession;
  } else {
    // Legacy DebugSession (shouldn't happen with new implementation)
    sessionId = idOrSession.id;
    enhancedSession = context.sessions.get(sessionId);
  }

  if (!enhancedSession) {
    return;
  }

  // Create snapshot for termination tracking
  const compatWrapper = context.compatibilitySessions.get(sessionId);
  if (compatWrapper) {
    const snapshot = createSessionSnapshot(compatWrapper);
    context.terminatedSessionManager.store(snapshot);
  }

  await cleanupEnhancedSession(enhancedSession, {
    sessionTimeouts: context.sessionTimeouts,
    resourceTracker: context.resourceTracker,
    activityTracker: context.activityTracker,
  });
  context.sessions.delete(sessionId);
  context.compatibilitySessions.delete(sessionId);
}
