import { randomUUID } from 'crypto';
import { EnhancedDebugSession } from './enhanced-debug-session.js';
import { SessionCompatibilityWrapper } from './session-compatibility-wrapper.js';
import {
  AdapterFactory,
  setInitialBreakpoints,
} from './sessions/session-factory.js';
import { createSessionInfo } from './sessions/session-utils.js';
import type {
  DebugRequest,
  DebugState,
  SessionLifecycleState,
  DebugSession,
} from './types/index.js';

/**
 * Lightweight session manager for debug session lifecycle management.
 *
 * Manages the creation, retrieval, deletion, and cleanup of debug sessions for both
 * Node.js and browser platforms. This manager handles session lifecycle only - all
 * debug control operations (breakpoints, stepping, evaluation) are delegated to
 * {@link EnhancedDebugSession} instances.
 *
 * Key responsibilities:
 * - Creates and initializes debug sessions with appropriate adapters
 * - Maintains session registries with compatibility wrappers
 * - Handles graceful session cleanup and termination
 * - Provides backward-compatible interface via {@link SessionCompatibilityWrapper}
 * @example Basic usage
 * ```typescript
 * const manager = LightweightSessionManager.getInstance();
 *
 * // Create a Node.js debug session
 * const sessionId = await manager.createSession({
 *   platform: 'node',
 *   target: './app.js',
 *   breakpoints: [{ file: './app.js', line: 10 }]
 * });
 *
 * // Retrieve and use the session
 * const session = manager.getSession(sessionId);
 * await session?.adapter.stepOver();
 *
 * // Clean up
 * await manager.deleteSession(sessionId);
 * ```
 * @example Shutdown all sessions
 * ```typescript
 * // At application exit
 * await manager.shutdown();
 * ```
 * @public
 * @see file:./enhanced-debug-session.ts - Debug session implementation
 * @see file:./session-compatibility-wrapper.ts - Backward compatibility layer
 * @see file:./types/session.ts:94-119 - ISessionManager interface
 */
export class LightweightSessionManager {
  private static instance: LightweightSessionManager | undefined;
  private sessions = new Map<string, EnhancedDebugSession>();
  private wrappedSessions = new Map<string, SessionCompatibilityWrapper>();
  private adapterFactory = new AdapterFactory();

  private constructor() {}

  /**
   * Retrieves the singleton instance of the session manager.
   *
   * Creates the instance on first access using lazy initialization.
   * The singleton ensures consistent session state across the application.
   * @returns The singleton LightweightSessionManager instance
   * @public
   */
  public static getInstance(): LightweightSessionManager {
    if (!LightweightSessionManager.instance) {
      LightweightSessionManager.instance = new LightweightSessionManager();
    }
    return LightweightSessionManager.instance;
  }

  /**
   * Resets the singleton instance by shutting down all sessions and clearing the instance.
   *
   * Primarily used in test environments to ensure clean state between tests.
   * In production, prefer using {@link shutdown} to clean up sessions while maintaining
   * the singleton instance.
   * @remarks
   * This method performs a full shutdown before clearing the instance reference,
   * ensuring all debug adapters are properly disconnected and resources are released.
   * @public
   */
  public static resetInstance(): void {
    if (LightweightSessionManager.instance) {
      // Clean up all sessions before reset
      LightweightSessionManager.instance.shutdown();
    }
    LightweightSessionManager.instance = undefined;
  }

  /**
   * Creates and initializes a new debug session for the specified platform.
   *
   * This method handles the complete session creation lifecycle:
   * 1. Generates a unique session ID
   * 2. Creates platform-specific debug adapter (Node.js or browser)
   * 3. Initializes the session and establishes debug connection
   * 4. Sets up timeout handling if specified
   * 5. Configures initial breakpoints if provided
   * 6. Creates compatibility wrapper for legacy API support
   * 7. Registers cleanup handlers for automatic session removal on termination
   * @param request - Configuration for the debug session including platform, target, and options
   * @returns Promise resolving to the unique session ID
   * @throws When session ID collision occurs (UUID collision, extremely rare)
   * @throws When adapter creation fails for unsupported platform
   * @throws When session initialization fails (connection, breakpoint setup, etc.)
   * @example Node.js debugging with breakpoints
   * ```typescript
   * const sessionId = await manager.createSession({
   *   platform: 'node',
   *   target: './src/app.ts',
   *   command: 'tsx',
   *   breakpoints: [
   *     { file: './src/app.ts', line: 42 },
   *     { file: './src/app.ts', line: 58, condition: 'user.isAdmin' }
   *   ],
   *   timeout: 30000
   * });
   * ```
   * @example Browser debugging
   * ```typescript
   * const sessionId = await manager.createSession({
   *   platform: 'browser',
   *   target: 'http://localhost:3000'
   * });
   * ```
   * @public
   * @see file:./types/request.ts - DebugRequest type definition
   * @see file:./adapters/node-adapter.ts - Node.js adapter implementation
   * @see file:./adapters/browser-adapter.ts - Browser adapter implementation
   */
  public async createSession(request: DebugRequest): Promise<string> {
    const sessionId = randomUUID();

    // Check for duplicate session creation (edge case protection)
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ID collision detected: ${sessionId}`);
    }

    const adapter = this.adapterFactory.createAdapter(
      request.platform,
      request,
    );
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
        await setInitialBreakpoints(session, request.breakpoints);
      }

      // Create compatibility wrapper
      const wrapper = new SessionCompatibilityWrapper(session);
      this.wrappedSessions.set(sessionId, wrapper);

      // NOTE: We intentionally do NOT auto-delete sessions when they terminate.
      // See session-lifecycle.ts:124-133 for detailed rationale.
      // Sessions persist for post-mortem inspection until explicitly deleted.

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
   * Retrieves a debug session by its ID, returning the backward-compatible wrapper.
   *
   * Returns the {@link SessionCompatibilityWrapper} instance that provides the legacy
   * {@link DebugSession} interface. For direct access to the enhanced session API,
   * use {@link getEnhancedSession} instead.
   * @param id - Unique session identifier returned from {@link createSession}
   * @returns The wrapped debug session, or undefined if not found
   * @public
   * @see file:./session-compatibility-wrapper.ts - Wrapper implementation
   */
  public getSession(id: string): DebugSession | undefined {
    return this.wrappedSessions.get(id);
  }

  /**
   * Retrieves the enhanced debug session by its ID for direct API access.
   *
   * Returns the {@link EnhancedDebugSession} instance which provides the full modern
   * debugging API with event-driven architecture and lifecycle management. Use this
   * when you need access to features not available through the legacy interface.
   * @param id - Unique session identifier returned from {@link createSession}
   * @returns The enhanced debug session, or undefined if not found
   * @example Using enhanced features
   * ```typescript
   * const enhanced = manager.getEnhancedSession(sessionId);
   * if (enhanced) {
   *   // Access lifecycle state
   *   console.log(enhanced.lifecycleState);
   *
   *   // Subscribe to events
   *   enhanced.on('paused', (data) => {
   *     console.log('Paused at:', data.location);
   *   });
   * }
   * ```
   * @public
   * @see file:./enhanced-debug-session.ts - Enhanced session implementation
   */
  public getEnhancedSession(id: string): EnhancedDebugSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Deletes a debug session by terminating it and removing it from registries.
   *
   * This method performs graceful session cleanup:
   * 1. Terminates the debug session (disconnects adapter, releases resources)
   * 2. Removes the session from the enhanced session registry
   * 3. Removes the session from the wrapped session registry
   *
   * If the session does not exist, this method is a no-op (idempotent).
   * @param id - Unique session identifier to delete
   * @returns Promise that resolves when the session is fully deleted
   * @remarks
   * Sessions automatically clean up on termination via event handlers, but this
   * method ensures explicit cleanup and is safe to call even after auto-cleanup.
   * @public
   */
  public async deleteSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }

    await session.terminate();
    this.sessions.delete(id);
    this.wrappedSessions.delete(id);
  }

  /**
   * Lists all currently active debug sessions with their metadata.
   *
   * Returns a snapshot of all sessions managed by this instance, including their
   * current execution state, lifecycle state, and activity information. The returned
   * array is a plain data structure suitable for serialization or display.
   * @returns Array of session information objects containing:
   *          - id: Unique session identifier
   *          - platform: Debug platform ('node' | 'browser')
   *          - target: Debug target (script path or URL)
   *          - state: Current debug execution state
   *          - startTime: ISO timestamp of session creation
   *          - metadata: Additional lifecycle and activity information
   * @example Monitoring active sessions
   * ```typescript
   * const sessions = manager.listSessions();
   * console.log(`Active sessions: ${sessions.length}`);
   * sessions.forEach(s => {
   *   console.log(`${s.id}: ${s.platform} - ${s.state}`);
   * });
   * ```
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
    return Array.from(this.sessions.values()).map(createSessionInfo);
  }

  /**
   * Shuts down all active debug sessions gracefully.
   *
   * Terminates all managed sessions in parallel using Promise.allSettled to ensure
   * all cleanup attempts complete even if individual sessions fail. Errors during
   * individual session cleanup are logged but do not prevent other sessions from
   * being cleaned up.
   * @returns Promise that resolves when all sessions have been cleaned up
   * @remarks
   * This method should be called during application shutdown to ensure proper
   * cleanup of debug connections and resources. The parallel cleanup approach
   * minimizes shutdown time while maintaining cleanup reliability.
   * @example Application shutdown
   * ```typescript
   * process.on('SIGTERM', async () => {
   *   await manager.shutdown();
   *   process.exit(0);
   * });
   * ```
   * @public
   */
  public async shutdown(): Promise<void> {
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
   * Waits for a debug session to pause, returning the wrapped session.
   *
   * This method provides backward compatibility with the legacy session manager API.
   * It delegates to the enhanced session's waitForPause method and returns the
   * compatibility wrapper.
   * @param sessionId - Unique session identifier
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000)
   * @returns Promise resolving to wrapped session when paused, or undefined if session not found
   * @remarks
   * New code should prefer using the enhanced session API directly via
   * {@link getEnhancedSession} for better type safety and event-driven patterns.
   * @public
   */
  public async waitForPause(
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
