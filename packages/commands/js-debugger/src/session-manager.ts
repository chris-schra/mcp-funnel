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
 * Session manager implementation that handles debug session lifecycle with comprehensive cleanup
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
   * Get the singleton instance of SessionManager
   */
  static getInstance(
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
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    if (SessionManager.instance) {
      SessionManager.instance.processHandlerManager.removeHandlers();
      // Clean up all sessions before reset
      SessionManager.instance.shutdown();
    }
    SessionManager.instance = undefined;
  }

  /**
   * Create a new debug session with unique ID
   */
  async createSession(request: DebugRequest): Promise<IDebugSession> {
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
   * Get a session by ID (returns compatibility wrapper for backward compatibility)
   */
  getSession(id: string): DebugSession | undefined {
    const activeSession = this.compatibilitySessions.get(id);
    if (activeSession) {
      return activeSession;
    }

    return this.terminatedSessionManager.get(id);
  }

  /**
   * Get an enhanced session by ID (returns the new session-centered object)
   */
  getEnhancedSession(id: string): IDebugSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Delete a session and clean up resources
   */
  async deleteSession(
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
   * Get session with automatic activity tracking
   */
  getSessionWithActivity(id: string): DebugSession | undefined {
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
   * List all active sessions
   */
  listSessions(): Array<{
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
   * Enhanced cleanup configuration methods
   */
  getCleanupConfig(): SessionCleanupConfig {
    return this.cleanupManager.getConfig();
  }

  setCleanupConfig(config: Partial<SessionCleanupConfig>): void {
    this.cleanupManager.setConfig(config);
  }

  /**
   * Manual cleanup of inactive sessions
   */
  async cleanupInactiveSessions(
    options: SessionCleanupOptions = {},
  ): Promise<number> {
    return await this.cleanupManager.cleanupInactiveSessions(options);
  }

  async waitForPause(
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
   * Shutdown all sessions and cleanup global resources
   */
  async shutdown(): Promise<void> {
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
 * Default export - singleton instance getter
 */
export default SessionManager.getInstance;
