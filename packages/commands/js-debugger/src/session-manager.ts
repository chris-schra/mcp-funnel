import { randomUUID } from 'crypto';
import {
  ISessionManager,
  IDebugSession,
  DebugSession,
  DebugRequest,
  DebugState,
  SessionCleanupConfig,
  SessionCleanupOptions,
  SessionLifecycleState,
} from './types/index.js';
import { EnhancedDebugSession } from './enhanced-debug-session.js';
import { SessionCompatibilityWrapper } from './session-compatibility-wrapper.js';
import {
  AdapterFactory,
  IAdapterFactory,
  setInitialBreakpoints,
} from './sessions/session-factory.js';
import { SessionResourceTracker } from './sessions/resource-tracker.js';
import { SessionActivityTracker } from './sessions/activity-tracker.js';
import { CleanupManager } from './sessions/cleanup-manager.js';
import { ProcessHandlerManager } from './sessions/process-handlers.js';
import { TerminatedSessionManager } from './sessions/terminated-session-manager.js';
import {
  createSessionSnapshot,
  updateSessionActivity,
} from './sessions/session-utils.js';
import {
  cleanupEnhancedSession,
  setupEnhancedSessionTimeouts,
} from './sessions/session-cleanup-utils.js';
import { waitForPause as waitForPauseUtil } from './sessions/wait-for-pause.js';

/**
 * Singleton session manager for debug session lifecycle management.
 *
 * Manages the lifecycle of debug sessions across Node.js and browser platforms,
 * providing comprehensive cleanup, resource tracking, and activity monitoring.
 * Uses a singleton pattern to maintain a centralized registry of all active debug sessions.
 *
 * Key responsibilities:
 * - Session creation and initialization with adapter configuration
 * - Resource tracking and automatic cleanup of inactive sessions
 * - Activity monitoring with timeout and heartbeat mechanisms
 * - Process signal handling for graceful shutdown
 * - Backward compatibility through wrapper layer
 *
 * Architecture:
 * - EnhancedDebugSession: Modern session-centered API with event emitters
 * - SessionCompatibilityWrapper: Legacy DebugSession interface support
 * - CleanupManager: Background cleanup of inactive sessions
 * - ResourceTracker: Memory and connection resource monitoring
 * - ActivityTracker: User interaction and heartbeat tracking
 * @example Creating and managing debug sessions
 * ```typescript
 * const manager = SessionManager.getInstance();
 *
 * // Create a Node.js debug session
 * const session = await manager.createSession({
 *   platform: 'node',
 *   target: './script.js',
 *   breakpoints: [{ file: './script.js', line: 10 }],
 *   timeout: 30000
 * });
 *
 * // Wait for execution to pause at breakpoint
 * const pausedSession = await manager.waitForPause(session.id, 5000);
 *
 * // List all active sessions
 * const sessions = manager.listSessions();
 * console.log(`Active sessions: ${sessions.length}`);
 *
 * // Clean up session when done
 * await manager.deleteSession(session.id);
 * ```
 * @example Cleanup configuration
 * ```typescript
 * const manager = SessionManager.getInstance();
 *
 * // Configure cleanup thresholds
 * manager.setCleanupConfig({
 *   sessionTimeoutMs: 30 * 60 * 1000,  // 30 minutes
 *   inactivityThresholdMs: 5 * 60 * 1000,  // 5 minutes
 *   resourceThreshold: 100 * 1024 * 1024  // 100MB
 * });
 *
 * // Manual cleanup with preview
 * const count = await manager.cleanupInactiveSessions({ dryRun: true });
 * console.log(`Would clean up ${count} sessions`);
 *
 * // Force cleanup all inactive
 * await manager.cleanupInactiveSessions({ force: true });
 * ```
 * @public
 * @see file:./enhanced-debug-session.ts - Modern session implementation
 * @see file:./session-compatibility-wrapper.ts - Legacy interface adapter
 * @see file:./sessions/cleanup-manager.ts - Background cleanup logic
 * @see file:./types/session.ts:94-119 - ISessionManager interface
 */
export class SessionManager implements ISessionManager {
  private static instance: SessionManager | undefined;
  private sessions = new Map<string, EnhancedDebugSession>();
  private compatibilitySessions = new Map<
    string,
    SessionCompatibilityWrapper
  >();
  private adapterFactory: IAdapterFactory;
  private sessionTimeouts = new Map<string, NodeJS.Timeout>();

  // Enhanced cleanup and tracking components
  private resourceTracker: SessionResourceTracker;
  private activityTracker: SessionActivityTracker;
  private cleanupManager: CleanupManager;
  private processHandlerManager: ProcessHandlerManager;
  private terminatedSessionManager: TerminatedSessionManager;
  private isShuttingDown = false;

  private constructor(
    adapterFactory?: IAdapterFactory,
    cleanupConfig?: Partial<SessionCleanupConfig>,
  ) {
    this.adapterFactory = adapterFactory ?? new AdapterFactory();
    this.resourceTracker = new SessionResourceTracker();
    this.activityTracker = new SessionActivityTracker();
    this.terminatedSessionManager = new TerminatedSessionManager();

    // Initialize cleanup manager
    this.cleanupManager = new CleanupManager(
      {
        sessions: this.sessions,
        activityTracker: this.activityTracker,
        resourceTracker: this.resourceTracker,
        deleteSession: this.deleteSession.bind(this),
        get isShuttingDown() {
          return this.isShuttingDown;
        },
      },
      cleanupConfig,
    );
    this.cleanupManager.initialize();

    // Initialize process handler manager
    this.processHandlerManager = new ProcessHandlerManager({
      shutdown: this.shutdown.bind(this),
    });
    this.processHandlerManager.setupHandlers();
  }

  /**
   * Retrieves the singleton SessionManager instance, creating it if necessary.
   *
   * Uses lazy initialization to create the singleton on first access. Subsequent
   * calls return the same instance regardless of parameters. To apply new configuration
   * or factory, use {@link resetInstance} first.
   * @param adapterFactory - Custom adapter factory for creating platform-specific debug adapters (Node.js/browser)
   * @param cleanupConfig - Initial cleanup configuration for session timeout and resource thresholds
   * @returns The singleton SessionManager instance
   * @example Basic usage
   * ```typescript
   * const manager = SessionManager.getInstance();
   * ```
   * @example With custom configuration
   * ```typescript
   * const manager = SessionManager.getInstance(
   *   new CustomAdapterFactory(),
   *   { sessionTimeoutMs: 60000, inactivityThresholdMs: 10000 }
   * );
   * ```
   * @public
   * @see file:./sessions/session-factory.ts:15-30 - AdapterFactory implementation
   * @see file:./types/cleanup.ts:1-20 - SessionCleanupConfig interface
   */
  public static getInstance(
    adapterFactory?: IAdapterFactory,
    cleanupConfig?: Partial<SessionCleanupConfig>,
  ): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(
        adapterFactory,
        cleanupConfig,
      );
    }
    return SessionManager.instance;
  }

  /**
   * Resets the singleton instance by shutting down and clearing it.
   *
   * Performs graceful shutdown of all active sessions, removes process signal handlers,
   * and clears the singleton instance. Primarily used in testing to ensure clean state
   * between test runs, but can also be used to reconfigure the manager with different
   * adapter factories or cleanup configurations.
   * @example Test cleanup
   * ```typescript
   * afterEach(async () => {
   *   SessionManager.resetInstance();
   * });
   * ```
   * @public
   * @see file:./session-manager.test.ts:25-35 - Test usage examples
   */
  public static resetInstance(): void {
    if (SessionManager.instance) {
      SessionManager.instance.processHandlerManager.removeHandlers();
      // Clean up all sessions before reset
      SessionManager.instance.shutdown();
    }
    SessionManager.instance = undefined;
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
   * @param request - Debug session configuration including platform, target, breakpoints, and timeout
   * @returns Promise resolving to the initialized debug session
   * @throws When session ID collision occurs (extremely rare with UUID)
   * @throws When adapter initialization fails (process spawn error, connection refused, etc.)
   * @throws When breakpoint registration fails during initialization
   * @example Node.js debugging
   * ```typescript
   * const session = await manager.createSession({
   *   platform: 'node',
   *   target: './index.js',
   *   args: ['--experimental-modules'],
   *   breakpoints: [
   *     { file: './index.js', line: 15, condition: 'user.id === 123' }
   *   ],
   *   timeout: 30000
   * });
   * ```
   * @example Browser debugging
   * ```typescript
   * const session = await manager.createSession({
   *   platform: 'browser',
   *   target: 'http://localhost:3000',
   *   breakpoints: [{ file: 'app.js', line: 42 }]
   * });
   * ```
   * @public
   * @see file:./types/request.ts - DebugRequest interface
   * @see file:./sessions/session-factory.ts:40-65 - Adapter creation
   * @see file:./handlers/debug-handler.ts:225 - Usage in debug tool handler
   */
  public async createSession(request: DebugRequest): Promise<IDebugSession> {
    const sessionId = randomUUID();

    // Check for duplicate session creation (edge case protection)
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ID collision detected: ${sessionId}`);
    }

    const adapter = this.adapterFactory.createAdapter(
      request.platform,
      request,
    );
    const enhancedSession = new EnhancedDebugSession(
      sessionId,
      adapter,
      request,
    );

    // Store session before initialization
    this.sessions.set(sessionId, enhancedSession);

    // Record session creation activity
    this.activityTracker.recordActivity(sessionId, 'state_change');

    try {
      // Track adapter connection as a resource
      this.resourceTracker.trackResource(
        sessionId,
        `adapter-${sessionId}`,
        'connection',
      );

      // Initialize the session (this handles adapter connection)
      await enhancedSession.initialize();

      // Set up enhanced timeout and heartbeat mechanisms
      const timeoutMs =
        request.timeout || this.cleanupManager.getConfig().sessionTimeoutMs;
      setupEnhancedSessionTimeouts(
        enhancedSession,
        timeoutMs,
        this.resourceTracker,
      );

      // Set initial breakpoints if specified
      if (request.breakpoints) {
        await setInitialBreakpoints(enhancedSession, request.breakpoints);
      }

      // Create compatibility wrapper for backward compatibility
      const compatibilityWrapper = new SessionCompatibilityWrapper(
        enhancedSession,
      );
      this.compatibilitySessions.set(sessionId, compatibilityWrapper);

      // Auto-cleanup when session terminates
      enhancedSession.on('terminated', () => {
        this.sessions.delete(sessionId);
        this.compatibilitySessions.delete(sessionId);
        this.activityTracker.removeSession(sessionId);
      });

      this.activityTracker.recordActivity(sessionId, 'state_change');
    } catch (error) {
      // Clean up on initialization failure
      await this.deleteSession(sessionId);
      throw new Error(
        `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return enhancedSession;
  }

  /**
   * Retrieves a session by ID, returning the legacy DebugSession interface.
   *
   * Returns a compatibility wrapper for active sessions or a snapshot from terminated
   * session history. This method maintains backward compatibility with legacy code
   * expecting the old DebugSession interface. For new code, prefer {@link getEnhancedSession}.
   * @param id - Session ID (UUID) returned from {@link createSession}
   * @returns The session wrapped in compatibility interface, or undefined if not found
   * @example Retrieving active session
   * ```typescript
   * const session = manager.getSession(sessionId);
   * if (session) {
   *   console.log(`Session state: ${session.state}`);
   * }
   * ```
   * @public
   * @see file:./session-compatibility-wrapper.ts - Legacy interface adapter
   * @see file:./sessions/terminated-session-manager.ts - Terminated session storage
   */
  public getSession(id: string): DebugSession | undefined {
    const activeSession = this.compatibilitySessions.get(id);
    if (activeSession) {
      return activeSession;
    }

    return this.terminatedSessionManager.get(id);
  }

  /**
   * Retrieves an enhanced session by ID, returning the modern IDebugSession interface.
   *
   * Returns the new session-centered object with event-driven API and improved type safety.
   * Prefer this method over {@link getSession} for new code. Returns undefined for
   * terminated sessions (use {@link getSession} to access terminated session snapshots).
   * @param id - Session ID (UUID) returned from {@link createSession}
   * @returns The enhanced session object, or undefined if not active
   * @example Using enhanced session API
   * ```typescript
   * const session = manager.getEnhancedSession(sessionId);
   * if (session) {
   *   // Event-driven API
   *   session.on('paused', (data) => console.log('Paused at', data.location));
   *   await session.continue();
   * }
   * ```
   * @public
   * @see file:./enhanced-debug-session.ts - Enhanced session implementation
   * @see file:./types/session.ts:56-92 - IDebugSession interface
   */
  public getEnhancedSession(id: string): IDebugSession | undefined {
    return this.sessions.get(id);
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
   * @param idOrSession - Session ID string, DebugSession, or EnhancedDebugSession instance
   * @example Delete by ID
   * ```typescript
   * await manager.deleteSession(sessionId);
   * ```
   * @example Delete by session object
   * ```typescript
   * const session = manager.getSession(sessionId);
   * if (session) {
   *   await manager.deleteSession(session);
   * }
   * ```
   * @public
   * @see file:./sessions/session-cleanup-utils.ts:15-45 - Cleanup implementation
   * @see file:./handlers/stop-handler.ts:93 - Usage in stop tool handler
   * @see file:./handlers/continue-handler.ts:118 - Usage in stop action
   */
  public async deleteSession(
    idOrSession: string | DebugSession | EnhancedDebugSession,
  ): Promise<void> {
    let sessionId: string;
    let enhancedSession: EnhancedDebugSession | undefined;

    if (typeof idOrSession === 'string') {
      sessionId = idOrSession;
      enhancedSession = this.sessions.get(sessionId);
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
      enhancedSession = this.sessions.get(sessionId);
    }

    if (!enhancedSession) {
      return;
    }

    // Create snapshot for termination tracking
    const compatWrapper = this.compatibilitySessions.get(sessionId);
    if (compatWrapper) {
      const snapshot = createSessionSnapshot(compatWrapper);
      this.terminatedSessionManager.store(snapshot);
    }

    await cleanupEnhancedSession(enhancedSession, {
      sessionTimeouts: this.sessionTimeouts,
      resourceTracker: this.resourceTracker,
      activityTracker: this.activityTracker,
    });
    this.sessions.delete(sessionId);
    this.compatibilitySessions.delete(sessionId);
  }

  /**
   * Retrieves a session and records user activity for cleanup tracking.
   *
   * Similar to {@link getSession} but automatically records user activity timestamp
   * and increments activity counter. This prevents the session from being considered
   * inactive during automatic cleanup cycles. Use this when user actions interact
   * with a session to keep it alive.
   * @param id - Session ID (UUID)
   * @returns The session with updated activity metadata, or undefined if not found
   * @example Activity-aware retrieval
   * ```typescript
   * // User continues execution - record activity
   * const session = manager.getSessionWithActivity(sessionId);
   * if (session) {
   *   await session.adapter.continue();
   * }
   * ```
   * @internal
   * @see file:./sessions/session-utils.ts:42-55 - Activity update logic
   */
  private getSessionWithActivity(id: string): DebugSession | undefined {
    const session = this.sessions.get(id);
    if (session) {
      // Record user activity when accessing session
      this.activityTracker.recordActivity(id, 'user_action');
      // Create a compatibility wrapper to avoid type issues
      const compatWrapper = this.compatibilitySessions.get(id);
      if (compatWrapper) {
        updateSessionActivity(
          compatWrapper,
          this.activityTracker.getActivityCount(id),
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
   * @returns Array of session summary objects with id, platform, target, state, and optional metadata
   * @example Listing sessions
   * ```typescript
   * const sessions = manager.listSessions();
   * sessions.forEach(s => {
   *   console.log(`${s.id}: ${s.platform} ${s.target} - ${s.state}`);
   *   if (s.metadata) {
   *     console.log(`  Last activity: ${s.metadata.lastActivity}`);
   *   }
   * });
   * ```
   * @public
   * @see file:./handlers/list-sessions-handler.ts:80 - Usage in list_sessions tool
   * @see file:./handlers/cleanup-sessions-handler.ts:117 - Usage in cleanup operations
   */
  public listSessions(): Array<{
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
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      platform: session.request.platform,
      target: session.request.target,
      state: session.state,
      startTime: session.startTime,
      metadata: session.metadata
        ? {
            lifecycleState: session.lifecycleState,
            lastActivity: session.metadata.lastActivityAt,
            resourceCount: this.resourceTracker.getResourceCount(session.id),
          }
        : undefined,
    }));
  }

  /**
   * Retrieves the current cleanup configuration.
   *
   * Returns the active configuration controlling automatic cleanup behavior including
   * session timeout thresholds, inactivity detection, resource limits, and cleanup
   * interval timing.
   * @returns Current cleanup configuration with all thresholds and intervals
   * @example Inspecting cleanup config
   * ```typescript
   * const config = manager.getCleanupConfig();
   * console.log(`Session timeout: ${config.sessionTimeoutMs}ms`);
   * console.log(`Cleanup interval: ${config.cleanupIntervalMs}ms`);
   * ```
   * @public
   * @see file:./types/cleanup.ts:1-20 - SessionCleanupConfig interface
   * @see file:./sessions/cleanup-manager.ts:35-50 - Default configuration
   */
  public getCleanupConfig(): SessionCleanupConfig {
    return this.cleanupManager.getConfig();
  }

  /**
   * Updates the cleanup configuration with partial overrides.
   *
   * Merges provided configuration properties with existing config. Changes take effect
   * immediately for subsequent cleanup cycles. Does not retroactively affect scheduled
   * cleanup operations already in progress.
   * @param config - Partial cleanup configuration with properties to override
   * @example Adjusting timeout thresholds
   * ```typescript
   * manager.setCleanupConfig({
   *   sessionTimeoutMs: 60 * 60 * 1000,  // 1 hour
   *   inactivityThresholdMs: 10 * 60 * 1000  // 10 minutes
   * });
   * ```
   * @public
   * @see file:./types/cleanup.ts:1-20 - SessionCleanupConfig interface
   */
  public setCleanupConfig(config: Partial<SessionCleanupConfig>): void {
    this.cleanupManager.setConfig(config);
  }

  /**
   * Manually triggers cleanup of inactive sessions based on configured thresholds.
   *
   * Scans all active sessions and terminates those matching cleanup criteria:
   * - Exceeded inactivity threshold (no user actions within timeframe)
   * - Exceeded absolute session timeout (total lifetime)
   * - Exceeded resource usage threshold (memory/console output size)
   *
   * The cleanup operation respects the force and dryRun options. In dryRun mode,
   * no sessions are actually terminated - only a count of eligible sessions is returned.
   * @param options - Cleanup options controlling force termination and dry run behavior. Supports force flag to ignore thresholds and dryRun flag to preview cleanup count without terminating sessions
   * @returns Promise resolving to the number of sessions cleaned (or would be cleaned in dryRun)
   * @example Preview cleanup
   * ```typescript
   * const count = await manager.cleanupInactiveSessions({ dryRun: true });
   * console.log(`Would clean up ${count} sessions`);
   * ```
   * @example Force cleanup
   * ```typescript
   * const cleaned = await manager.cleanupInactiveSessions({ force: true });
   * console.log(`Cleaned up ${cleaned} sessions`);
   * ```
   * @public
   * @see file:./sessions/cleanup-manager.ts:75-120 - Cleanup implementation
   * @see file:./handlers/cleanup-sessions-handler.ts:78 - Usage in cleanup_sessions tool
   * @see file:./types/cleanup.ts:22-26 - SessionCleanupOptions interface
   */
  public async cleanupInactiveSessions(
    options: SessionCleanupOptions = {},
  ): Promise<number> {
    return await this.cleanupManager.cleanupInactiveSessions(options);
  }

  /**
   * Waits for a debug session to reach paused state, polling until timeout.
   *
   * Polls the session state at regular intervals (100ms) until the session enters
   * the 'paused' state or the timeout expires. Returns the paused session or undefined
   * if timeout occurs. Used after creating sessions with breakpoints to wait for
   * initial pause before interaction.
   *
   * The method polls both active sessions and terminated session history, allowing
   * it to detect if a session terminated while waiting for pause.
   * @param sessionId - Session ID (UUID) to wait for
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000ms / 10 seconds)
   * @returns Promise resolving to the paused session, or undefined if timeout/not found
   * @example Wait for breakpoint hit
   * ```typescript
   * const session = await manager.createSession({
   *   platform: 'node',
   *   target: './script.js',
   *   breakpoints: [{ file: './script.js', line: 10 }]
   * });
   *
   * // Wait up to 5 seconds for execution to pause at breakpoint
   * const pausedSession = await manager.waitForPause(session.id, 5000);
   * if (pausedSession && pausedSession.state === 'paused') {
   *   console.log('Hit breakpoint!');
   * }
   * ```
   * @public
   * @see file:./sessions/wait-for-pause.ts - Polling implementation
   * @see file:./handlers/debug-handler.ts:233 - Usage in debug tool handler
   */
  public async waitForPause(
    sessionId: string,
    timeoutMs = 10000,
  ): Promise<DebugSession | undefined> {
    return await waitForPauseUtil(
      sessionId,
      {
        sessions: this.sessions,
        compatibilitySessions: this.compatibilitySessions,
        terminatedSessionManager: this.terminatedSessionManager,
      },
      timeoutMs,
    );
  }

  /**
   * Performs graceful shutdown of all sessions and cleanup of global resources.
   *
   * Terminates all active debug sessions, stops the cleanup manager's background
   * interval, removes process signal handlers (SIGINT, SIGTERM), and cleans up
   * tracking data structures. This method is idempotent - multiple calls are safe.
   *
   * Shutdown sequence:
   * 1. Set shutdown flag to prevent new operations
   * 2. Remove process signal handlers
   * 3. Stop cleanup manager background tasks
   * 4. Terminate all active sessions in parallel
   * 5. Clean up resource and activity trackers
   *
   * This method is automatically called on process signals (SIGINT, SIGTERM) and
   * should also be called when tests complete or when the application is shutting down.
   * @example Application shutdown
   * ```typescript
   * process.on('SIGTERM', async () => {
   *   const manager = SessionManager.getInstance();
   *   await manager.shutdown();
   *   process.exit(0);
   * });
   * ```
   * @example Test cleanup
   * ```typescript
   * afterAll(async () => {
   *   await SessionManager.getInstance().shutdown();
   * });
   * ```
   * @public
   * @see file:./sessions/process-handlers.ts:25-45 - Process signal handling
   * @see file:./sessions/cleanup-manager.ts:140-160 - Cleanup manager shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.processHandlerManager.removeHandlers();

    console.info('SessionManager shutting down...');

    // Shutdown cleanup manager
    await this.cleanupManager.shutdown();

    // Clean up all active sessions
    const sessionIds = Array.from(this.sessions.keys());
    const cleanupPromises = sessionIds.map(async (sessionId) => {
      try {
        await this.deleteSession(sessionId);
      } catch (error) {
        console.warn(
          `Error cleaning up session ${sessionId} during shutdown:`,
          error,
        );
      }
    });

    await Promise.allSettled(cleanupPromises);

    // Clean up trackers
    this.resourceTracker.cleanup();
    this.activityTracker.cleanup();

    console.info('SessionManager shutdown complete');
  }
}

/**
 * Default export providing singleton instance getter function.
 *
 * Allows importing the getInstance method directly as the default export.
 * Equivalent to calling SessionManager.getInstance().
 * @example Default import
 * ```typescript
 * import getSessionManager from './session-manager.js';
 * const manager = getSessionManager();
 * ```
 * @public
 */
export default SessionManager.getInstance;
