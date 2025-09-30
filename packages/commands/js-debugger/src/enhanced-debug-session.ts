/* eslint-disable max-lines */
// This file exceeds max-lines due to comprehensive JSDoc documentation and IDebugSession interface implementation.
// The class already delegates to EventManager, ActivityTracker, and MemoryManager helpers.
// Further splitting would harm cohesion as this is the central session coordinator.
import Emittery from 'emittery';
import type {
  IDebugAdapter,
  DebugRequest,
  DebugState,
  BreakpointInfo,
  BreakpointRegistration,
  ConsoleMessage,
  StackFrame,
  Scope,
  EvaluationResult,
  SessionMetadata,
  SessionLifecycleState,
  DebugSessionEvents,
} from './types/index.js';
import { EventManager } from './session/event-manager.js';
import { ActivityTracker } from './session/activity-tracker.js';
import { MemoryManager } from './session/memory-manager.js';
import { executeWithErrorHandling } from './session/operation-helpers.js';

/**
 * Event-driven debug session manager implementing the IDebugSession interface.
 * Encapsulates debug session state, adapter communication, and lifecycle management
 * with built-in event emission for reactive debugging workflows. Extends Emittery
 * to provide type-safe event handling for pause, resume, console output, and other
 * debug events.
 *
 * Key features:
 * - Automatic activity tracking and resource usage monitoring
 * - Breakpoint management with verification
 * - Console output capture with memory limits
 * - Event-driven state updates
 * - Graceful session termination with cleanup
 * @example Basic session usage
 * ```typescript
 * const adapter = new NodeDebugAdapter({ request });
 * const session = new EnhancedDebugSession('session-1', adapter, request);
 *
 * // Listen for pause events
 * session.on('paused', (state) => {
 *   console.log('Paused at:', state.location);
 * });
 *
 * await session.initialize();
 * await session.setBreakpoint('app.ts', 42);
 * await session.continue();
 * ```
 * @example Event-driven debugging
 * ```typescript
 * session.on('console', (msg) => {
 *   console.log(`[${msg.level}]`, msg.text);
 * });
 *
 * session.on('breakpointResolved', (bp) => {
 *   console.log(`Breakpoint set at ${bp.resolvedLocations?.[0]}`);
 * });
 * ```
 * @see file:./types/session.ts:56-92 - IDebugSession interface definition
 * @see file:./session-manager.ts:132-150 - Session creation and management
 * @see file:./types/events.ts:6-13 - Event types definition
 * @public
 */
export class EnhancedDebugSession extends Emittery<DebugSessionEvents> {
  public readonly id: string;
  public readonly request: DebugRequest;
  public readonly startTime: string;
  public readonly adapter: IDebugAdapter;
  private _state: DebugState;
  private _lifecycleState: SessionLifecycleState = 'initializing';
  private _metadata: SessionMetadata;
  private _breakpoints = new Map<string, BreakpointInfo>();
  private _consoleOutput: ConsoleMessage[] = [];
  private cleanup?: {
    timeoutHandle?: NodeJS.Timeout;
    heartbeatHandle?: NodeJS.Timeout;
    resources: Set<string>;
  };

  public constructor(
    id: string,
    adapter: IDebugAdapter,
    request: DebugRequest,
  ) {
    super();
    this.id = id;
    this.adapter = adapter;
    this.request = request;
    this.startTime = new Date().toISOString();
    this._state = { status: 'terminated' };

    const now = this.startTime;
    this._metadata = {
      createdAt: now,
      lastActivityAt: now,
      activityCount: 0,
      resourceUsage: {
        consoleOutputSize: 0,
        memoryEstimate: 1024, // Base estimate
      },
    };

    this.cleanup = {
      resources: new Set<string>(),
    };

    this.setupAdapterEventHandlers();
  }

  /**
   * Current debug execution state (running, paused, or terminated).
   * @returns Current debug state
   * @public
   */
  public get state(): DebugState {
    return this._state;
  }

  /**
   * Session lifecycle state tracking initialization, connection, and termination phases.
   * Separate from debug execution state to distinguish session management from code execution.
   * @returns Current lifecycle state
   * @public
   */
  public get lifecycleState(): SessionLifecycleState {
    return this._lifecycleState;
  }

  /**
   * Session metadata including activity tracking and resource usage.
   * Returns a shallow copy to prevent external modification.
   * @returns Copy of session metadata
   * @public
   */
  public get metadata(): SessionMetadata {
    return { ...this._metadata };
  }

  /**
   * Read-only view of all breakpoints set in this session.
   * @returns Read-only map of breakpoints
   * @public
   */
  public get breakpoints(): ReadonlyMap<string, BreakpointInfo> {
    return this._breakpoints;
  }

  /**
   * Read-only view of captured console output.
   * Returns a shallow copy to prevent external modification of the internal array.
   * @returns Copy of console output array
   * @public
   */
  public get consoleOutput(): readonly ConsoleMessage[] {
    return [...this._consoleOutput];
  }

  /**
   * Initializes the debug session by connecting the adapter to the target.
   * Establishes the connection to the debug target (Node.js process or browser),
   * transitions through initialization states, and sets up for active debugging.
   * Must be called before any other debug operations.
   * @returns Promise that resolves when initialization completes
   * @throws Error When adapter connection fails
   * @example
   * ```typescript
   * const session = new EnhancedDebugSession(id, adapter, request);
   * await session.initialize();
   * // Now ready for debugging operations
   * ```
   * @see file:./session-manager.ts:132-150 - Called during session creation
   * @public
   */
  public async initialize(): Promise<void> {
    return executeWithErrorHandling(
      async () => {
        this._lifecycleState = 'initializing';
        await this.adapter.connect(this.request.target);
        this._lifecycleState = 'connected';

        if (this._state.status === 'terminated') {
          this._state = { status: 'running' };
        }

        this._lifecycleState = 'active';
        this.updateActivity();
      },
      async (error) => {
        this._lifecycleState = 'terminated';
        await this.emit('error', error);
      },
    );
  }

  /**
   * Waits for the session to pause, returning immediately if already paused.
   * Resolves when the session enters paused state or terminates. If already
   * paused or terminated, returns current state immediately. Returns current
   * state on timeout without rejecting.
   * @param timeout - Maximum wait time in milliseconds (default: 10000)
   * @returns Promise resolving to debug state when paused, terminated, or timeout occurs
   * @example
   * ```typescript
   * await session.continue();
   * const state = await session.waitForPause(5000);
   * if (state.status === 'paused') {
   *   console.log('Paused at:', state.location);
   * }
   * ```
   * @see file:./sessions/wait-for-pause.ts:10-33 - Utility wrapper for multiple sessions
   * @public
   */
  public async waitForPause(timeout = 10000): Promise<DebugState> {
    return new Promise((resolve) => {
      if (this._state.status === 'paused') {
        resolve(this._state);
        return;
      }

      if (this._state.status === 'terminated') {
        resolve(this._state);
        return;
      }

      const timeoutHandle = setTimeout(() => {
        this.off('paused', handlePaused);
        this.off('terminated', handleTerminated);
        resolve(this._state); // Return current state on timeout
      }, timeout);

      const handlePaused = (state: DebugState) => {
        clearTimeout(timeoutHandle);
        this.off('terminated', handleTerminated);
        resolve(state);
      };

      const handleTerminated = () => {
        clearTimeout(timeoutHandle);
        this.off('paused', handlePaused);
        resolve(this._state);
      };

      this.on('paused', handlePaused);
      this.on('terminated', handleTerminated);
    });
  }

  /**
   * Executes a stepping operation with automatic activity tracking and state updates.
   * Internal helper that wraps all step operations (continue, stepOver, etc.) with
   * consistent error handling and state management.
   * @param operation - Async function that performs the step operation via adapter
   * @returns Promise resolving to updated debug state
   * @internal
   */
  private async executeStepOperation(
    operation: () => Promise<DebugState>,
  ): Promise<DebugState> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        const state = await operation();
        this.updateState(state);
        return state;
      },
      (error) => this.emit('error', error),
    );
  }

  /**
   * Continues execution until next breakpoint or termination.
   * @returns Promise resolving to new debug state
   * @public
   */
  public async continue(): Promise<DebugState> {
    return this.executeStepOperation(() => this.adapter.continue());
  }

  /**
   * Steps over the current line, executing function calls without entering them.
   * @returns Promise resolving to new debug state
   * @public
   */
  public async stepOver(): Promise<DebugState> {
    return this.executeStepOperation(() => this.adapter.stepOver());
  }

  /**
   * Steps into the current function call.
   * @returns Promise resolving to new debug state
   * @public
   */
  public async stepInto(): Promise<DebugState> {
    return this.executeStepOperation(() => this.adapter.stepInto());
  }

  /**
   * Steps out of the current function to the calling frame.
   * @returns Promise resolving to new debug state
   * @public
   */
  public async stepOut(): Promise<DebugState> {
    return this.executeStepOperation(() => this.adapter.stepOut());
  }

  /**
   * Sets a breakpoint at the specified file location.
   * Registers a breakpoint with the debug adapter and stores it in the session.
   * Emits 'breakpointResolved' event when successfully set. The breakpoint may
   * be verified asynchronously by the adapter.
   * @param file - Absolute or relative path to source file
   * @param line - Line number (1-indexed)
   * @param condition - Optional conditional expression to break only when true
   * @returns Promise resolving to breakpoint registration with verification status
   * @throws Error When breakpoint cannot be set
   * @example
   * ```typescript
   * const bp = await session.setBreakpoint('app.ts', 42, 'x > 10');
   * console.log('Breakpoint verified:', bp.verified);
   * ```
   * @see file:./sessions/session-factory.ts:42-54 - Setting initial breakpoints
   * @public
   */
  public async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        const registration = await this.adapter.setBreakpoint(
          file,
          line,
          condition,
        );

        this._breakpoints.set(registration.id, {
          id: registration.id,
          file,
          line,
          condition,
          verified: registration.verified,
          resolvedLocations: registration.resolvedLocations,
        });

        await this.emit('breakpointResolved', registration);
        return registration;
      },
      (error) => this.emit('error', error),
    );
  }

  /**
   * Removes a previously set breakpoint by its ID.
   * @param id - Breakpoint identifier returned from setBreakpoint
   * @returns Promise that resolves when breakpoint is removed
   * @throws Error When breakpoint removal fails
   * @public
   */
  public async removeBreakpoint(id: string): Promise<void> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        await this.adapter.removeBreakpoint(id);
        this._breakpoints.delete(id);
      },
      (error) => this.emit('error', error),
    );
  }

  /**
   * Evaluates a JavaScript expression in the current debug context.
   * Executes arbitrary code in the paused execution context, returning the result.
   * Can be used to inspect variables, call functions, or modify state during debugging.
   * @param expression - JavaScript expression to evaluate
   * @returns Promise resolving to evaluation result with type and value
   * @throws Error When evaluation fails or session is not paused
   * @example
   * ```typescript
   * const result = await session.evaluate('x + y');
   * console.log(`Result: ${result.value}`);
   * ```
   * @public
   */
  public async evaluate(expression: string): Promise<EvaluationResult> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        return await this.adapter.evaluate(expression);
      },
      (error) => this.emit('error', error),
    );
  }

  /**
   * Retrieves the current call stack when execution is paused.
   * @returns Promise resolving to array of stack frames, top frame first
   * @throws Error When session is not paused or stack retrieval fails
   * @public
   */
  public async getStackTrace(): Promise<StackFrame[]> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        return await this.adapter.getStackTrace();
      },
      (error) => this.emit('error', error),
    );
  }

  /**
   * Retrieves variable scopes for a specific stack frame.
   * Returns local, closure, and global scopes containing variables accessible
   * at the specified frame.
   * @param frameId - Stack frame index (0 is top frame)
   * @returns Promise resolving to array of scopes with variable references
   * @throws Error When session is not paused or frame doesn't exist
   * @public
   */
  public async getScopes(frameId: number): Promise<Scope[]> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        return await this.adapter.getScopes(frameId);
      },
      (error) => this.emit('error', error),
    );
  }

  /**
   * Terminates the debug session and performs cleanup.
   * Disconnects from the debug adapter, clears all timers, resets console output,
   * and emits termination event. After termination, the session cannot be reused.
   * @returns Promise that resolves when termination completes
   * @throws Error When adapter disconnection fails
   * @example
   * ```typescript
   * session.on('terminated', () => {
   *   console.log('Session ended');
   * });
   * await session.terminate();
   * ```
   * @public
   */
  public async terminate(): Promise<void> {
    return executeWithErrorHandling(
      async () => {
        this._lifecycleState = 'terminating';

        if (this.cleanup?.timeoutHandle)
          clearTimeout(this.cleanup.timeoutHandle);
        if (this.cleanup?.heartbeatHandle)
          clearInterval(this.cleanup.heartbeatHandle);

        await this.adapter.disconnect();

        this._state = { status: 'terminated' };
        this._lifecycleState = 'terminated';
        this._consoleOutput = MemoryManager.clearConsoleOutput();

        await this.emit('terminated', undefined);
      },
      (error) => this.emit('error', error),
    );
  }

  /**
   * Sets up event handlers for adapter events and connects them to session state.
   * Configures bidirectional event flow: adapter events update session state,
   * which triggers session events for external listeners. Supports both event-driven
   * and legacy callback-based adapters.
   * @see file:./session/event-manager.ts:39-46 - EventManager implementation
   * @internal
   */
  private setupAdapterEventHandlers(): void {
    EventManager.setupAdapterEventHandlers({
      adapter: this.adapter,
      captureConsole: this.request.captureConsole !== false,
      breakpoints: this._breakpoints,
      onConsoleMessage: (message) => {
        this.addConsoleMessage(message);
        void this.emit('console', message);
      },
      onStateUpdate: (state) => {
        this.updateState(state);
      },
      onLifecycleStateChange: (state) => {
        this._lifecycleState = state;
      },
      onPaused: (state) => {
        void this.emit('paused', state);
      },
      onResumed: () => {
        void this.emit('resumed', undefined);
      },
      onBreakpointResolved: (registration) => {
        void this.emit('breakpointResolved', registration);
      },
    });
  }

  /**
   * Updates internal debug state and activity metadata from adapter events.
   * @param state - New debug state from adapter
   * @internal
   */
  private updateState(state: DebugState): void {
    const updates = ActivityTracker.updateStateAndActivity(
      this._metadata,
      state,
    );
    this._state = updates.state;
    Object.assign(this._metadata, updates.metadata);
  }

  /**
   * Adds console message to output buffer with automatic memory management.
   * Enforces memory limits by truncating old messages when buffer exceeds threshold.
   * Updates resource usage metadata accordingly.
   * @param message - Console message from debugged process
   * @see file:./session/memory-manager.ts - Memory management implementation
   * @internal
   */
  private addConsoleMessage(message: ConsoleMessage): void {
    this._consoleOutput = MemoryManager.addConsoleMessage(
      this._consoleOutput,
      message,
    );

    // Update metadata
    const memoryContext = {
      consoleOutput: this._consoleOutput,
      breakpointsSize: this._breakpoints.size,
      metadata: this._metadata,
    };
    Object.assign(
      this._metadata,
      MemoryManager.updateMemoryMetadata(memoryContext),
    );
    this.updateActivity();
  }

  /**
   * Updates activity timestamp and counter for session tracking.
   * @internal
   */
  private updateActivity(): void {
    const updates = ActivityTracker.updateActivity(this._metadata);
    Object.assign(this._metadata, updates);
  }

  /**
   * Sets up automatic session termination after the specified timeout.
   * Used by session managers to enforce maximum session lifetimes. The timeout
   * can be cleared by calling terminate() before expiration.
   * @param timeoutMs - Timeout duration in milliseconds
   * @example
   * ```typescript
   * session.setupTimeout(30 * 60 * 1000); // 30 minutes
   * ```
   * @see file:./sessions/session-cleanup-utils.ts:20-41 - Cleanup utility usage
   * @public
   */
  public setupTimeout(timeoutMs: number): void {
    if (this.cleanup) {
      this.cleanup.timeoutHandle = setTimeout(() => {
        void this.terminate();
      }, timeoutMs);
    }
  }
}
