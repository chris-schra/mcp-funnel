import { randomUUID } from 'crypto';
import {
  ISessionManager,
  DebugSession,
  DebugRequest,
  DebugState,
  ConsoleMessage,
  SessionCleanupConfig,
  SessionLifecycleState,
} from './types/index.js';
import { SessionResourceTracker } from './utils/session-resource-tracker.js';
import { SessionActivityTracker } from './utils/session-activity-tracker.js';
import { IAdapterFactory, AdapterFactory } from './utils/adapter-factory.js';
import { DEFAULT_CLEANUP_CONFIG } from './utils/session-cleanup-config.js';
import { setInitialBreakpoints } from './utils/session-setup-utils.js';
import {
  cleanupSessionResources,
  findOldestSessions,
} from './utils/session-cleanup-utils.js';
import {
  setupSessionTimeout,
  setupHeartbeat,
} from './utils/session-timeout-utils.js';
import { setupProcessExitHandlers } from './utils/process-handlers.js';
import {
  setupSessionEventHandlers,
  addConsoleOutputWithMemoryManagement,
  updateSessionActivity,
} from './utils/session-event-handlers.js';
import { cleanupInactiveSessions as cleanupInactive } from './utils/session-cleanup-inactive.js';

/**
 * Session manager implementation that handles debug session lifecycle with comprehensive cleanup
 */
export class SessionManager implements ISessionManager {
  private static instance: SessionManager | undefined;
  private sessions = new Map<string, DebugSession>();
  private adapterFactory: IAdapterFactory;
  private sessionTimeouts = new Map<string, NodeJS.Timeout>();
  private cleanupConfig: SessionCleanupConfig;
  private resourceTracker: SessionResourceTracker;
  private activityTracker: SessionActivityTracker;
  private globalCleanupTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  private constructor(
    adapterFactory?: IAdapterFactory,
    cleanupConfig?: Partial<SessionCleanupConfig>,
  ) {
    this.adapterFactory = adapterFactory ?? new AdapterFactory();
    this.cleanupConfig = { ...DEFAULT_CLEANUP_CONFIG, ...cleanupConfig };
    this.resourceTracker = new SessionResourceTracker();
    this.activityTracker = new SessionActivityTracker();

    this.initializeCleanupMechanisms();
    setupProcessExitHandlers(() => this.shutdown(), {
      current: this.isShuttingDown,
    });
  }

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

  public static resetInstance(): void {
    if (SessionManager.instance) {
      SessionManager.instance.shutdown();
    }
    SessionManager.instance = undefined;
  }

  private initializeCleanupMechanisms(): void {
    if (this.cleanupConfig.enableAutoCleanup) {
      this.globalCleanupTimer = setInterval(
        () => this.performGlobalCleanup(),
        this.cleanupConfig.cleanupIntervalMs,
      );
      this.globalCleanupTimer.unref();
    }
  }

  public async createSession(request: DebugRequest): Promise<string> {
    const sessionId = randomUUID();

    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ID collision detected: ${sessionId}`);
    }

    const adapter = this.adapterFactory.createAdapter(
      request.platform,
      request,
    );
    const now = new Date().toISOString();

    const session: DebugSession = {
      id: sessionId,
      adapter,
      request,
      breakpoints: new Map(),
      state: { status: 'terminated' },
      startTime: now,
      consoleOutput: [],
      metadata: {
        createdAt: now,
        lastActivityAt: now,
        activityCount: 0,
        resourceUsage: {
          consoleOutputSize: 0,
          memoryEstimate: 0,
        },
      },
      lifecycleState: 'initializing',
      cleanup: {
        resources: new Set<string>(),
      },
    };

    setupSessionEventHandlers(
      session,
      this.activityTracker,
      this.cleanupConfig,
      (s, m) => this.handleConsoleOutput(s, m),
      (s) => updateSessionActivity(s, this.activityTracker),
    );

    this.sessions.set(sessionId, session);
    this.activityTracker.recordActivity(sessionId, 'state_change');

    try {
      this.resourceTracker.trackResource(
        sessionId,
        `adapter-${sessionId}`,
        'connection',
      );

      await adapter.connect(request.target);
      session.lifecycleState = 'connected';
      this.activityTracker.recordActivity(sessionId, 'state_change');

      if (session.state.status === 'terminated') {
        session.state = { status: 'running' };
      }

      setupSessionTimeout(
        sessionId,
        this.sessions,
        this.sessionTimeouts,
        this.resourceTracker,
        this.cleanupConfig,
        request.timeout,
        (id) => this.deleteSession(id),
      );

      if (this.cleanupConfig.enableHeartbeat) {
        setupHeartbeat(
          sessionId,
          this.sessions,
          this.resourceTracker,
          this.activityTracker,
          this.cleanupConfig,
        );
      }

      if (request.breakpoints) {
        await setInitialBreakpoints(session, request.breakpoints);
      }

      session.lifecycleState = 'active';
      this.activityTracker.recordActivity(sessionId, 'state_change');
    } catch (error) {
      this.deleteSession(sessionId);
      throw new Error(
        `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return sessionId;
  }

  public getSession(id: string): DebugSession | undefined {
    return this.sessions.get(id);
  }

  public deleteSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }

    cleanupSessionResources(
      session,
      this.sessionTimeouts,
      this.resourceTracker,
      this.activityTracker,
    );
    this.sessions.delete(id);
  }

  public getSessionWithActivity(id: string): DebugSession | undefined {
    const session = this.sessions.get(id);
    if (session) {
      this.activityTracker.recordActivity(id, 'user_action');
      updateSessionActivity(session, this.activityTracker);
    }
    return session;
  }

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

  public getCleanupConfig(): SessionCleanupConfig {
    return { ...this.cleanupConfig };
  }

  public setCleanupConfig(config: Partial<SessionCleanupConfig>): void {
    this.cleanupConfig = { ...this.cleanupConfig, ...config };

    if (config.cleanupIntervalMs && this.globalCleanupTimer) {
      clearInterval(this.globalCleanupTimer);
      if (this.cleanupConfig.enableAutoCleanup) {
        this.globalCleanupTimer = setInterval(
          () => this.performGlobalCleanup(),
          this.cleanupConfig.cleanupIntervalMs,
        );
        this.globalCleanupTimer.unref();
      }
    }
  }

  public async cleanupInactiveSessions(): Promise<number> {
    return cleanupInactive(
      this.sessions,
      this.activityTracker,
      this.cleanupConfig,
      (id) => this.deleteSession(id),
    );
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.info('SessionManager shutting down...');

    if (this.globalCleanupTimer) {
      clearInterval(this.globalCleanupTimer);
      this.globalCleanupTimer = undefined;
    }

    const sessionIds = Array.from(this.sessions.keys());
    const cleanupPromises = sessionIds.map(async (sessionId) => {
      try {
        this.deleteSession(sessionId);
      } catch (error) {
        console.warn(
          `Error cleaning up session ${sessionId} during shutdown:`,
          error,
        );
      }
    });

    await Promise.allSettled(cleanupPromises);

    this.resourceTracker.cleanup();
    this.activityTracker.cleanup();

    console.info('SessionManager shutdown complete');
  }

  private handleConsoleOutput(
    session: DebugSession,
    message: ConsoleMessage,
  ): void {
    addConsoleOutputWithMemoryManagement(session, message, this.cleanupConfig);
  }

  private async performGlobalCleanup(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      await this.cleanupInactiveSessions();

      const totalSessions = this.sessions.size;
      if (totalSessions > this.cleanupConfig.maxInactiveSessionsBeforeCleanup) {
        console.info(
          `Too many sessions (${totalSessions}), forcing cleanup of oldest inactive`,
        );
        const oldestSessionIds = findOldestSessions(
          this.sessions,
          totalSessions - this.cleanupConfig.maxInactiveSessionsBeforeCleanup,
        );
        for (const sessionId of oldestSessionIds) {
          console.info(`Force cleaning up old session: ${sessionId}`);
          this.deleteSession(sessionId);
        }
      }
    } catch (error) {
      console.error('Error during global cleanup:', error);
    }
  }
}

/**
 * Default export - singleton instance getter
 */
export default SessionManager.getInstance;
