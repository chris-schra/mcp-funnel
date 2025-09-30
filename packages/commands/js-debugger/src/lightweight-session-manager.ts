import { randomUUID } from 'crypto';
import { EnhancedDebugSession } from './enhanced-debug-session.js';
import { SessionCompatibilityWrapper } from './session-compatibility-wrapper.js';
import { NodeDebugAdapter } from './adapters/node-adapter.js';
import { BrowserAdapter } from './adapters/browser-adapter.js';
import type {
  IDebugAdapter,
  DebugRequest,
  DebugState,
  SessionLifecycleState,
  DebugSession,
} from './types/index.js';

/**
 * Lightweight session manager focused only on creation, listing, and deletion.
 * All session control and state management is handled by EnhancedDebugSession.
 */
export class LightweightSessionManager {
  private static instance: LightweightSessionManager | undefined;
  private sessions = new Map<string, EnhancedDebugSession>();
  private wrappedSessions = new Map<string, SessionCompatibilityWrapper>();

  private constructor() {}

  /**
   * Get the singleton instance of LightweightSessionManager
   */
  static getInstance(): LightweightSessionManager {
    if (!LightweightSessionManager.instance) {
      LightweightSessionManager.instance = new LightweightSessionManager();
    }
    return LightweightSessionManager.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    if (LightweightSessionManager.instance) {
      // Clean up all sessions before reset
      LightweightSessionManager.instance.shutdown();
    }
    LightweightSessionManager.instance = undefined;
  }

  /**
   * Create a new debug session
   */
  async createSession(request: DebugRequest): Promise<string> {
    const sessionId = randomUUID();

    // Check for duplicate session creation (edge case protection)
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ID collision detected: ${sessionId}`);
    }

    const adapter = this.createAdapterForPlatform(request.platform, request);
    const session = new EnhancedDebugSession(sessionId, adapter, request);

    // Store session before initialization
    this.sessions.set(sessionId, session);

    try {
      // Initialize the session
      await session.initialize();

      // Set up session timeout if specified
      if (request.timeout) {
        session.setupTimeout(request.timeout);
      }

      // Set initial breakpoints if specified
      if (request.breakpoints) {
        await this.setInitialBreakpoints(session, request.breakpoints);
      }

      // Create compatibility wrapper
      const wrapper = new SessionCompatibilityWrapper(session);
      this.wrappedSessions.set(sessionId, wrapper);

      // Auto-cleanup when session terminates
      session.on('terminated', () => {
        this.sessions.delete(sessionId);
        this.wrappedSessions.delete(sessionId);
      });

      return session.id;
    } catch (error) {
      // Clean up on initialization failure
      this.sessions.delete(sessionId);
      throw new Error(
        `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): DebugSession | undefined {
    return this.wrappedSessions.get(id);
  }

  /**
   * Get the enhanced session by ID (for direct access to new API)
   */
  getEnhancedSession(id: string): EnhancedDebugSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Delete a session
   */
  async deleteSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }

    await session.terminate();
    this.sessions.delete(id);
    this.wrappedSessions.delete(id);
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
      metadata: {
        lifecycleState: session.lifecycleState,
        lastActivity: session.metadata.lastActivityAt,
        resourceCount: 0, // Not tracking resources in lightweight version
      },
    }));
  }

  /**
   * Shutdown all sessions
   */
  async shutdown(): Promise<void> {
    console.info('LightweightSessionManager shutting down...');

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
    console.info('LightweightSessionManager shutdown complete');
  }

  /**
   * Factory method to create appropriate adapter based on platform
   */
  private createAdapterForPlatform(
    platform: 'node' | 'browser',
    request?: DebugRequest,
  ): IDebugAdapter {
    switch (platform) {
      case 'node':
        return new NodeDebugAdapter({
          request,
        });
      case 'browser':
        return new BrowserAdapter({ request });
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Set initial breakpoints for a session
   */
  private async setInitialBreakpoints(
    session: EnhancedDebugSession,
    breakpoints: Array<{ file: string; line: number; condition?: string }>,
  ): Promise<void> {
    for (const bp of breakpoints) {
      try {
        await session.setBreakpoint(bp.file, bp.line, bp.condition);
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
   * Wait for a session to pause (legacy compatibility method)
   */
  async waitForPause(
    sessionId: string,
    timeoutMs = 10000,
  ): Promise<DebugSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    await session.waitForPause(timeoutMs);
    return this.wrappedSessions.get(sessionId);
  }
}
