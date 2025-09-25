import { randomUUID } from 'crypto';
import {
  ISessionManager,
  IDebugAdapter,
  DebugSession,
  DebugRequest,
  DebugState,
  ConsoleMessage,
  SessionCleanupConfig,
  SessionMetadata,
  SessionLifecycleState,
  ResourceTracker,
  SessionActivity,
} from './types.js';
import { NodeDebugAdapter } from './adapters/node-adapter.js';
import { BrowserAdapter } from './adapters/browser-adapter.js';

/**
 * Console message verbosity levels for filtering
 */
const VERBOSITY_LEVELS = {
  none: 0,
  'error-only': 1,
  'warn-error': 2,
  all: 3,
} as const;

/**
 * Console level priority mapping for filtering
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
 * Default cleanup configuration
 */
const DEFAULT_CLEANUP_CONFIG: SessionCleanupConfig = {
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  heartbeatIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxConsoleOutputEntries: 1000,
  maxInactiveSessionsBeforeCleanup: 10,
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
  memoryThresholdBytes: 100 * 1024 * 1024, // 100MB
  enableHeartbeat: true,
  enableAutoCleanup: true,
};

/**
 * Resource tracker implementation
 */
class SessionResourceTracker implements ResourceTracker {
  private resources = new Map<string, Map<string, { type: string; createdAt: string }>>();

  trackResource(sessionId: string, resourceId: string, type: 'process' | 'connection' | 'timer'): void {
    if (!this.resources.has(sessionId)) {
      this.resources.set(sessionId, new Map());
    }
    const sessionResources = this.resources.get(sessionId)!;
    sessionResources.set(resourceId, {
      type,
      createdAt: new Date().toISOString(),
    });
  }

  releaseResource(sessionId: string, resourceId: string): void {
    const sessionResources = this.resources.get(sessionId);
    if (sessionResources) {
      sessionResources.delete(resourceId);
      if (sessionResources.size === 0) {
        this.resources.delete(sessionId);
      }
    }
  }

  getResourceCount(sessionId: string): number {
    return this.resources.get(sessionId)?.size || 0;
  }

  getAllResources(sessionId: string): Array<{ id: string; type: string }> {
    const sessionResources = this.resources.get(sessionId);
    if (!sessionResources) return [];

    return Array.from(sessionResources.entries()).map(([id, resource]) => ({
      id,
      type: resource.type,
    }));
  }

  cleanup(): void {
    this.resources.clear();
  }
}

/**
 * Session activity tracker implementation
 */
class SessionActivityTracker implements SessionActivity {
  private activities = new Map<string, {
    lastActivity: string;
    activityCount: number;
    activities: Array<{ type: string; timestamp: string }>;
  }>();

  recordActivity(sessionId: string, type: 'user_action' | 'console_output' | 'state_change' | 'heartbeat'): void {
    const now = new Date().toISOString();
    const activity = this.activities.get(sessionId) || {
      lastActivity: now,
      activityCount: 0,
      activities: [],
    };

    activity.lastActivity = now;
    activity.activityCount++;
    activity.activities.push({ type, timestamp: now });

    // Keep only recent activities to prevent memory leaks
    if (activity.activities.length > 100) {
      activity.activities = activity.activities.slice(-50);
    }

    this.activities.set(sessionId, activity);
  }

  getLastActivity(sessionId: string): string | undefined {
    return this.activities.get(sessionId)?.lastActivity;
  }

  getActivityCount(sessionId: string): number {
    return this.activities.get(sessionId)?.activityCount || 0;
  }

  isSessionActive(sessionId: string, thresholdMs: number): boolean {
    const activity = this.activities.get(sessionId);
    if (!activity) return false;

    const lastActivity = new Date(activity.lastActivity);
    const now = new Date();
    return (now.getTime() - lastActivity.getTime()) < thresholdMs;
  }

  cleanup(): void {
    this.activities.clear();
  }

  removeSession(sessionId: string): void {
    this.activities.delete(sessionId);
  }
}

/**
 * Factory interface for creating debug adapters
 */
interface IAdapterFactory {
  createAdapter(
    platform: 'node' | 'browser',
    request?: DebugRequest,
  ): IDebugAdapter;
}

/**
 * Real adapter factory - creates appropriate adapters based on platform
 */
class AdapterFactory implements IAdapterFactory {
  createAdapter(
    platform: 'node' | 'browser',
    request?: DebugRequest,
  ): IDebugAdapter {
    switch (platform) {
      case 'node':
        return new NodeDebugAdapter({
          request: request,
        });
      case 'browser':
        return new BrowserAdapter();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

/**
 * Session manager implementation that handles debug session lifecycle with comprehensive cleanup
 */
export class SessionManager implements ISessionManager {
  private static instance: SessionManager | undefined;
  private sessions = new Map<string, DebugSession>();
  private adapterFactory: IAdapterFactory;
  private sessionTimeouts = new Map<string, NodeJS.Timeout>();

  // Enhanced cleanup and tracking components
  private cleanupConfig: SessionCleanupConfig;
  private resourceTracker: SessionResourceTracker;
  private activityTracker: SessionActivityTracker;
  private globalCleanupTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  private constructor(adapterFactory?: IAdapterFactory, cleanupConfig?: Partial<SessionCleanupConfig>) {
    this.adapterFactory = adapterFactory ?? new AdapterFactory();
    this.cleanupConfig = { ...DEFAULT_CLEANUP_CONFIG, ...cleanupConfig };
    this.resourceTracker = new SessionResourceTracker();
    this.activityTracker = new SessionActivityTracker();

    this.initializeCleanupMechanisms();
    this.setupProcessExitHandlers();
  }

  /**
   * Get the singleton instance of SessionManager
   */
  static getInstance(adapterFactory?: IAdapterFactory, cleanupConfig?: Partial<SessionCleanupConfig>): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(adapterFactory, cleanupConfig);
    }
    return SessionManager.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    if (SessionManager.instance) {
      // Clean up all sessions before reset
      SessionManager.instance.shutdown();
    }
    SessionManager.instance = undefined;
  }

  /**
   * Initialize cleanup mechanisms and timers
   */
  private initializeCleanupMechanisms(): void {
    if (this.cleanupConfig.enableAutoCleanup) {
      this.globalCleanupTimer = setInterval(
        () => this.performGlobalCleanup(),
        this.cleanupConfig.cleanupIntervalMs
      );

      // Ensure cleanup timer doesn't prevent process exit
      this.globalCleanupTimer.unref();
    }
  }

  /**
   * Setup process exit handlers for proper cleanup
   */
  private setupProcessExitHandlers(): void {
    const cleanup = async () => {
      if (!this.isShuttingDown) {
        this.isShuttingDown = true;
        await this.shutdown();
      }
    };

    // Handle various process exit scenarios
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      cleanup();
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      cleanup();
    });
  }

  /**
   * Create a new debug session with unique ID
   */
  async createSession(request: DebugRequest): Promise<string> {
    const sessionId = randomUUID();

    // Check for duplicate session creation (edge case protection)
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ID collision detected: ${sessionId}`);
    }

    const adapter = this.createAdapterForPlatform(request.platform, request);
    const now = new Date().toISOString();

    const session: DebugSession = {
      id: sessionId,
      adapter,
      request,
      breakpoints: new Map(),
      state: { status: 'terminated' },
      startTime: now,
      consoleOutput: [],
      // Enhanced session metadata
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

    // Wire up enhanced event handlers
    this.setupSessionEventHandlers(session);

    // Store session before connection attempt
    this.sessions.set(sessionId, session);

    // Record session creation activity
    this.activityTracker.recordActivity(sessionId, 'state_change');

    try {
      // Track adapter connection as a resource
      this.resourceTracker.trackResource(sessionId, `adapter-${sessionId}`, 'connection');

      // Connect the adapter
      await adapter.connect(request.target);

      // Update lifecycle state
      session.lifecycleState = 'connected';
      this.activityTracker.recordActivity(sessionId, 'state_change');

      // After connection, the state might have been set by pause handler if --inspect-brk was used
      // Only set to running if no state was set (shouldn't happen) or still terminated
      // This preserves the 'paused' state from the initial --inspect-brk pause
      if (session.state.status === 'terminated') {
        session.state = { status: 'running' };
      }

      // Set up enhanced timeout and heartbeat mechanisms
      this.setupEnhancedSessionTimeouts(sessionId, request.timeout);

      // Set initial breakpoints if specified
      if (request.breakpoints) {
        await this.setInitialBreakpoints(session, request.breakpoints);
      }

      // Mark session as active
      session.lifecycleState = 'active';
      this.activityTracker.recordActivity(sessionId, 'state_change');
    } catch (error) {
      // Clean up on connection failure
      this.deleteSession(sessionId);
      throw new Error(
        `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return sessionId;
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): DebugSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Delete a session and clean up resources
   */
  deleteSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }

    this.cleanupSession(session);
    this.sessions.delete(id);
  }

  /**
   * Get session with automatic activity tracking
   */
  getSessionWithActivity(id: string): DebugSession | undefined {
    const session = this.sessions.get(id);
    if (session) {
      // Record user activity when accessing session
      this.activityTracker.recordActivity(id, 'user_action');
      this.updateSessionActivity(session);
    }
    return session;
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
      metadata: session.metadata ? {
        lifecycleState: session.lifecycleState,
        lastActivity: session.metadata.lastActivityAt,
        resourceCount: this.resourceTracker.getResourceCount(session.id),
      } : undefined,
    }));
  }

  /**
   * Enhanced cleanup configuration methods
   */
  getCleanupConfig(): SessionCleanupConfig {
    return { ...this.cleanupConfig };
  }

  setCleanupConfig(config: Partial<SessionCleanupConfig>): void {
    this.cleanupConfig = { ...this.cleanupConfig, ...config };

    // Restart cleanup timer if interval changed
    if (config.cleanupIntervalMs && this.globalCleanupTimer) {
      clearInterval(this.globalCleanupTimer);
      if (this.cleanupConfig.enableAutoCleanup) {
        this.globalCleanupTimer = setInterval(
          () => this.performGlobalCleanup(),
          this.cleanupConfig.cleanupIntervalMs
        );
        this.globalCleanupTimer.unref();
      }
    }
  }

  /**
   * Manual cleanup of inactive sessions
   */
  async cleanupInactiveSessions(): Promise<number> {
    let cleanedCount = 0;
    const sessionsToCleanup: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      const isInactive = !this.activityTracker.isSessionActive(
        sessionId,
        this.cleanupConfig.sessionTimeoutMs
      );

      const hasExceededMemoryThreshold = session.metadata &&
        session.metadata.resourceUsage.memoryEstimate > this.cleanupConfig.memoryThresholdBytes;

      if (isInactive || hasExceededMemoryThreshold) {
        sessionsToCleanup.push(sessionId);
      }
    }

    for (const sessionId of sessionsToCleanup) {
      try {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.deleteSession(sessionId);
        cleanedCount++;
      } catch (error) {
        console.warn(`Failed to cleanup session ${sessionId}:`, error);
      }
    }

    return cleanedCount;
  }

  /**
   * Factory method to create appropriate adapter based on platform
   */
  private createAdapterForPlatform(
    platform: 'node' | 'browser',
    request?: DebugRequest,
  ): IDebugAdapter {
    return this.adapterFactory.createAdapter(platform, request);
  }

  /**
   * Setup event handlers for a debug session
   */
  private setupSessionEventHandlers(session: DebugSession): void {
    const { adapter, request } = session;

    // Console output handler with verbosity filtering
    if (request.captureConsole !== false) {
      adapter.onConsoleOutput((message: ConsoleMessage) => {
        if (
          this.shouldIncludeConsoleMessage(message, request.consoleVerbosity)
        ) {
          session.consoleOutput.push(message);
        }
      });
    }

    // Pause handler
    adapter.onPaused((state: DebugState) => {
      session.state = state;
    });

    // Resume handler
    adapter.onResumed(() => {
      session.state = { status: 'running' };
    });
  }

  /**
   * Helper method to filter console messages based on verbosity setting
   */
  private shouldIncludeConsoleMessage(
    message: ConsoleMessage,
    verbosity: DebugRequest['consoleVerbosity'] = 'all',
  ): boolean {
    const verbosityLevel = VERBOSITY_LEVELS[verbosity];
    const messageLevel = CONSOLE_LEVEL_PRIORITY[message.level];

    return messageLevel <= verbosityLevel;
  }

  /**
   * Setup enhanced session timeout and heartbeat handling
   */
  private setupEnhancedSessionTimeouts(sessionId: string, requestTimeoutMs?: number): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.cleanup) return;

    // Use request timeout or default config timeout
    const timeoutMs = requestTimeoutMs || this.cleanupConfig.sessionTimeoutMs;

    // Session timeout
    const sessionTimeout = setTimeout(() => {
      const currentSession = this.sessions.get(sessionId);
      if (currentSession) {
        console.log(`Session ${sessionId} timed out after ${timeoutMs}ms`);
        currentSession.lifecycleState = 'terminating';
        currentSession.state = { status: 'terminated' };
        this.deleteSession(sessionId);
      }
    }, timeoutMs);

    session.cleanup.timeoutHandle = sessionTimeout;
    this.sessionTimeouts.set(sessionId, sessionTimeout);

    // Track timeout as a resource
    this.resourceTracker.trackResource(sessionId, `timeout-${sessionId}`, 'timer');

    // Setup heartbeat if enabled
    if (this.cleanupConfig.enableHeartbeat) {
      this.setupHeartbeat(sessionId);
    }
  }

  /**
   * Setup heartbeat mechanism for session
   */
  private setupHeartbeat(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.cleanup) return;

    const heartbeatInterval = setInterval(() => {
      const currentSession = this.sessions.get(sessionId);
      if (currentSession && currentSession.metadata) {
        // Record heartbeat activity
        this.activityTracker.recordActivity(sessionId, 'heartbeat');
        currentSession.metadata.lastHeartbeatAt = new Date().toISOString();

        // Check if session is still responsive
        if (currentSession.lifecycleState === 'active') {
          try {
            // For real sessions, we could ping the adapter
            // For now, just verify the adapter is still connected
            if (!currentSession.adapter) {
              console.warn(`Session ${sessionId} lost adapter connection`);
              currentSession.lifecycleState = 'inactive';
            }
          } catch (error) {
            console.warn(`Heartbeat check failed for session ${sessionId}:`, error);
            currentSession.lifecycleState = 'inactive';
          }
        }
      }
    }, this.cleanupConfig.heartbeatIntervalMs);

    session.cleanup.heartbeatHandle = heartbeatInterval;
    // Track heartbeat timer as resource
    this.resourceTracker.trackResource(sessionId, `heartbeat-${sessionId}`, 'timer');
  }

  /**
   * Legacy setup session timeout method for backward compatibility
   */
  private setupSessionTimeout(sessionId: string, timeoutMs: number): void {
    this.setupEnhancedSessionTimeouts(sessionId, timeoutMs);
  }

  /**
   * Set initial breakpoints for a session
   */
  private async setInitialBreakpoints(
    session: DebugSession,
    breakpoints: Array<{ file: string; line: number; condition?: string }>,
  ): Promise<void> {
    for (const bp of breakpoints) {
      try {
        const id = await session.adapter.setBreakpoint(
          bp.file,
          bp.line,
          bp.condition,
        );
        session.breakpoints.set(id, {
          id,
          file: bp.file,
          line: bp.line,
          condition: bp.condition,
        });
      } catch (error) {
        // Continue with other breakpoints even if one fails
        console.warn(
          `Failed to set breakpoint at ${bp.file}:${bp.line}:`,
          error,
        );
      }
    }
  }

  /**
   * Clean up session resources
   */
  private cleanupSession(session: DebugSession): void {
    // Clear timeout if exists
    const timeout = this.sessionTimeouts.get(session.id);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(session.id);
    }

    // Disconnect adapter
    session.adapter.disconnect().catch((error) => {
      console.warn(
        `Error disconnecting adapter for session ${session.id}:`,
        error,
      );
    });

    // Update state
    session.state = { status: 'terminated' };
  }
}

/**
 * Default export - singleton instance getter
 */
export default SessionManager.getInstance;
