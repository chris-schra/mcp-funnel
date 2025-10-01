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
import { AdapterFactory, IAdapterFactory } from './sessions/session-factory.js';
import { SessionResourceTracker } from './sessions/resource-tracker.js';
import { SessionActivityTracker } from './sessions/activity-tracker.js';
import { CleanupManager } from './sessions/cleanup-manager.js';
import { ProcessHandlerManager } from './sessions/process-handlers.js';
import { TerminatedSessionManager } from './sessions/terminated-session-manager.js';
import { waitForPause as waitForPauseUtil } from './sessions/wait-for-pause.js';
import {
  createDebugSession,
  deleteDebugSession,
  SessionLifecycleContext,
} from './sessions/session-lifecycle.js';
import {
  getSession as getSessionImpl,
  getEnhancedSession as getEnhancedSessionImpl,
  getSessionWithActivity as getSessionWithActivityImpl,
  listSessions as listSessionsImpl,
  SessionRetrievalContext,
} from './sessions/session-retrieval.js';
import {
  performShutdown,
  ShutdownContext,
} from './sessions/session-shutdown.js';

/**
 * Singleton session manager for debug session lifecycle management.
 *
 * Manages the lifecycle of debug sessions across Node.js and browser platforms,
 * providing comprehensive cleanup, resource tracking, and activity monitoring.
 *
 * Key responsibilities: session creation/deletion, resource tracking, automatic cleanup,
 * activity monitoring, process signal handling, and backward compatibility.
 * @public
 * @see file:./sessions/session-lifecycle.ts - Session creation and deletion
 * @see file:./sessions/session-retrieval.ts - Session access and listing
 * @see file:./sessions/cleanup-manager.ts - Background cleanup logic
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

    // Initialize process handler manager (but don't auto-register handlers)
    this.processHandlerManager = new ProcessHandlerManager({
      shutdown: this.shutdown.bind(this),
    });
    // Note: Process handlers are NOT automatically registered to avoid interfering
    // with the host process lifecycle (e.g., MCP server, tests).
    // Call enableProcessHandlers() explicitly if needed for standalone usage.
  }

  /**
   * Creates context for lifecycle operations.
   *
   * @returns Lifecycle context object
   * @internal
   */
  private getLifecycleContext(): SessionLifecycleContext {
    return {
      sessions: this.sessions,
      compatibilitySessions: this.compatibilitySessions,
      sessionTimeouts: this.sessionTimeouts,
      resourceTracker: this.resourceTracker,
      activityTracker: this.activityTracker,
      terminatedSessionManager: this.terminatedSessionManager,
      adapterFactory: this.adapterFactory,
      getCleanupConfig: () => this.cleanupManager.getConfig(),
    };
  }

  /**
   * Creates context for retrieval operations.
   *
   * @returns Retrieval context object
   * @internal
   */
  private getRetrievalContext(): SessionRetrievalContext {
    return {
      sessions: this.sessions,
      compatibilitySessions: this.compatibilitySessions,
      resourceTracker: this.resourceTracker,
      activityTracker: this.activityTracker,
      terminatedSessionManager: this.terminatedSessionManager,
    };
  }

  /**
   * Creates context for shutdown operations.
   *
   * @returns Shutdown context object
   * @internal
   */
  private getShutdownContext(): ShutdownContext {
    return {
      sessions: this.sessions,
      processHandlerManager: this.processHandlerManager,
      cleanupManager: this.cleanupManager,
      resourceTracker: this.resourceTracker,
      activityTracker: this.activityTracker,
      deleteSession: this.deleteSession.bind(this),
    };
  }

  /**
   * Retrieves the singleton SessionManager instance, creating it if necessary.
   * @param adapterFactory - Custom adapter factory (optional)
   * @param cleanupConfig - Initial cleanup configuration (optional)
   * @returns The singleton SessionManager instance
   * @public
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
   * Primarily used in testing to ensure clean state between test runs.
   * @public
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
   * @param request - Debug session configuration including platform, target, breakpoints, and timeout
   * @returns Promise resolving to the initialized debug session
   * @public
   * @see file:./sessions/session-lifecycle.ts - Implementation details
   */
  public async createSession(request: DebugRequest): Promise<IDebugSession> {
    return await createDebugSession(this.getLifecycleContext(), request);
  }

  /**
   * Retrieves a session by ID, returning the legacy DebugSession interface.
   * @param id - Session ID (UUID)
   * @returns The session wrapped in compatibility interface, or undefined if not found
   * @public
   */
  public getSession(id: string): DebugSession | undefined {
    return getSessionImpl(this.getRetrievalContext(), id);
  }

  /**
   * Retrieves an enhanced session by ID, returning the modern IDebugSession interface.
   * @param id - Session ID (UUID)
   * @returns The enhanced session object, or undefined if not active
   * @public
   */
  public getEnhancedSession(id: string): IDebugSession | undefined {
    return getEnhancedSessionImpl(this.getRetrievalContext(), id);
  }

  /**
   * Deletes a session and performs comprehensive resource cleanup.
   * @param idOrSession - Session ID string, DebugSession, or EnhancedDebugSession instance
   * @public
   * @see file:./sessions/session-lifecycle.ts - Implementation details
   */
  public async deleteSession(
    idOrSession: string | DebugSession | EnhancedDebugSession,
  ): Promise<void> {
    await deleteDebugSession(this.getLifecycleContext(), idOrSession);
  }

  /**
   * Retrieves a session and records user activity for cleanup tracking.
   * @param id - Session ID (UUID)
   * @returns The session with updated activity metadata, or undefined if not found
   * @internal
   */
  private getSessionWithActivity(id: string): DebugSession | undefined {
    return getSessionWithActivityImpl(this.getRetrievalContext(), id);
  }

  /**
   * Lists all currently active debug sessions with metadata.
   * @returns Array of session summary objects
   * @public
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
    return listSessionsImpl(this.getRetrievalContext());
  }

  /**
   * Retrieves the current cleanup configuration.
   * @returns Current cleanup configuration with all thresholds and intervals
   * @public
   */
  public getCleanupConfig(): SessionCleanupConfig {
    return this.cleanupManager.getConfig();
  }

  /**
   * Updates the cleanup configuration with partial overrides.
   * @param config - Partial cleanup configuration with properties to override
   * @public
   */
  public setCleanupConfig(config: Partial<SessionCleanupConfig>): void {
    this.cleanupManager.setConfig(config);
  }

  /**
   * Manually triggers cleanup of inactive sessions based on configured thresholds.
   * @param options - Cleanup options (force, dryRun)
   * @returns Promise resolving to the number of sessions cleaned
   * @public
   */
  public async cleanupInactiveSessions(
    options: SessionCleanupOptions = {},
  ): Promise<number> {
    return await this.cleanupManager.cleanupInactiveSessions(options);
  }

  /**
   * Waits for a debug session to reach paused state, polling until timeout.
   * @param sessionId - Session ID (UUID) to wait for
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000ms)
   * @returns Promise resolving to the paused session, or undefined if timeout/not found
   * @public
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
   * Enables automatic process signal handlers for cleanup on process exit.
   *
   * Registers handlers for SIGINT, SIGTERM, and process exit events that will
   * automatically call shutdown() when the process is terminating. This is useful
   * for standalone applications but should NOT be called in hosted environments
   * (like MCP servers or test suites) where the host manages process lifecycle.
   *
   * Note: This is NOT called automatically by the constructor to avoid interfering
   * with host process lifecycle management.
   * @example Standalone application
   * ```typescript
   * const manager = SessionManager.getInstance();
   * manager.enableProcessHandlers(); // Register cleanup on process exit
   * ```
   * @public
   */
  public enableProcessHandlers(): void {
    this.processHandlerManager.setupHandlers();
  }

  /**
   * Performs graceful shutdown of all sessions and cleanup of global resources.
   *
   * Terminates all active debug sessions, stops cleanup manager, removes process handlers,
   * and cleans up tracking structures. Idempotent - multiple calls are safe.
   * @public
   * @see file:./sessions/session-shutdown.ts - Shutdown implementation
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    await performShutdown(this.getShutdownContext());
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
