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
 * Enhanced DebugSession class that extends Emittery for event-driven architecture.
 * This class encapsulates all session operations and state management.
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

  constructor(id: string, adapter: IDebugAdapter, request: DebugRequest) {
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

  // Public getters for read-only access
  get state(): DebugState {
    return this._state;
  }

  get lifecycleState(): SessionLifecycleState {
    return this._lifecycleState;
  }

  get metadata(): SessionMetadata {
    return { ...this._metadata };
  }

  get breakpoints(): ReadonlyMap<string, BreakpointInfo> {
    return this._breakpoints;
  }

  get consoleOutput(): readonly ConsoleMessage[] {
    return [...this._consoleOutput];
  }

  /** Initialize the session by connecting the adapter */
  async initialize(): Promise<void> {
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
   * Wait for the session to pause with optional timeout
   */
  async waitForPause(timeout = 10000): Promise<DebugState> {
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
   * Execute a stepping operation with activity tracking
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

  /** Continue execution */
  async continue(): Promise<DebugState> {
    return this.executeStepOperation(() => this.adapter.continue());
  }

  /** Step over the current line */
  async stepOver(): Promise<DebugState> {
    return this.executeStepOperation(() => this.adapter.stepOver());
  }

  /** Step into the current function call */
  async stepInto(): Promise<DebugState> {
    return this.executeStepOperation(() => this.adapter.stepInto());
  }

  /** Step out of the current function */
  async stepOut(): Promise<DebugState> {
    return this.executeStepOperation(() => this.adapter.stepOut());
  }

  /** Set a breakpoint */
  async setBreakpoint(
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

  /** Remove a breakpoint */
  async removeBreakpoint(id: string): Promise<void> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        await this.adapter.removeBreakpoint(id);
        this._breakpoints.delete(id);
      },
      (error) => this.emit('error', error),
    );
  }

  /** Evaluate an expression */
  async evaluate(expression: string): Promise<EvaluationResult> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        return await this.adapter.evaluate(expression);
      },
      (error) => this.emit('error', error),
    );
  }

  /** Get stack trace */
  async getStackTrace(): Promise<StackFrame[]> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        return await this.adapter.getStackTrace();
      },
      (error) => this.emit('error', error),
    );
  }

  /** Get scopes for a frame */
  async getScopes(frameId: number): Promise<Scope[]> {
    return executeWithErrorHandling(
      async () => {
        this.updateActivity();
        return await this.adapter.getScopes(frameId);
      },
      (error) => this.emit('error', error),
    );
  }

  /** Terminate the session */
  async terminate(): Promise<void> {
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
   * Set up event handlers for the adapter
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
   * Update session state and emit events
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
   * Add console message with memory management
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
   * Update activity metadata
   */
  private updateActivity(): void {
    const updates = ActivityTracker.updateActivity(this._metadata);
    Object.assign(this._metadata, updates);
  }

  /**
   * Set up timeout for session
   */
  setupTimeout(timeoutMs: number): void {
    if (this.cleanup) {
      this.cleanup.timeoutHandle = setTimeout(() => {
        void this.terminate();
      }, timeoutMs);
    }
  }
}
