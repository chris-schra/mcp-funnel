import { randomUUID } from 'crypto';
import {
  ISessionManager,
  IDebugAdapter,
  DebugSession,
  DebugRequest,
  DebugState,
  ConsoleMessage,
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
 * Session manager implementation that handles debug session lifecycle
 */
export class SessionManager implements ISessionManager {
  private static instance: SessionManager | undefined;
  private sessions = new Map<string, DebugSession>();
  private adapterFactory: IAdapterFactory;
  private sessionTimeouts = new Map<string, NodeJS.Timeout>();

  private constructor(adapterFactory?: IAdapterFactory) {
    this.adapterFactory = adapterFactory ?? new AdapterFactory();
  }

  /**
   * Get the singleton instance of SessionManager
   */
  static getInstance(adapterFactory?: IAdapterFactory): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(adapterFactory);
    }
    return SessionManager.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    if (SessionManager.instance) {
      // Clean up all sessions before reset
      for (const sessionId of SessionManager.instance.sessions.keys()) {
        SessionManager.instance.deleteSession(sessionId);
      }
    }
    SessionManager.instance = undefined;
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

    const session: DebugSession = {
      id: sessionId,
      adapter,
      request,
      breakpoints: new Map(),
      state: { status: 'terminated' },
      startTime: new Date().toISOString(),
      consoleOutput: [],
    };

    // Wire up event handlers
    this.setupSessionEventHandlers(session);

    // Store session before connection attempt
    this.sessions.set(sessionId, session);

    try {
      // Connect the adapter
      await adapter.connect(request.target);

      // After connection, the state might have been set by pause handler if --inspect-brk was used
      // Only set to running if no state was set (shouldn't happen) or still terminated
      // This preserves the 'paused' state from the initial --inspect-brk pause
      if (session.state.status === 'terminated') {
        session.state = { status: 'running' };
      }

      // Set up timeout if specified
      if (request.timeout && request.timeout > 0) {
        this.setupSessionTimeout(sessionId, request.timeout);
      }

      // Set initial breakpoints if specified
      if (request.breakpoints) {
        await this.setInitialBreakpoints(session, request.breakpoints);
      }
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
   * List all active sessions
   */
  listSessions(): Array<{
    id: string;
    platform: string;
    target: string;
    state: DebugState;
    startTime: string;
  }> {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      platform: session.request.platform,
      target: session.request.target,
      state: session.state,
      startTime: session.startTime,
    }));
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
   * Setup session timeout handling
   */
  private setupSessionTimeout(sessionId: string, timeoutMs: number): void {
    const timeout = setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.state = { status: 'terminated' };
        this.deleteSession(sessionId);
      }
    }, timeoutMs);

    this.sessionTimeouts.set(sessionId, timeout);
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
