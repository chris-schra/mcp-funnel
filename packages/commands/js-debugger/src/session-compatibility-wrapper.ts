import type {
  DebugSession,
  IDebugAdapter,
  DebugRequest,
  DebugState,
  BreakpointInfo,
  ConsoleMessage,
  SessionMetadata,
  SessionLifecycleState,
  StackFrame,
  Scope,
  EvaluationResult,
  BreakpointRegistration,
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
  DebugSessionEvents,
} from './types/index.js';
import type { EnhancedDebugSession } from './enhanced-debug-session.js';

/**
 * Adapter wrapper that proxies calls to EnhancedDebugSession methods
 * to maintain backward compatibility with the old DebugSession interface.
 *
 * This wrapper allows legacy code expecting the IDebugAdapter interface to work
 * with the new EnhancedDebugSession API seamlessly.
 * @internal
 * @see file:./session-compatibility-wrapper.ts:119 - SessionCompatibilityWrapper usage
 */
class AdapterWrapper implements Omit<IDebugAdapter, 'continue'> {
  public constructor(private session: EnhancedDebugSession) {}

  public async connect(_target: string): Promise<void> {
    // This is handled by the session during initialization
    throw new Error('connect() should not be called on wrapped adapter');
  }

  public async disconnect(): Promise<void> {
    return this.session.terminate();
  }

  public async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    return this.session.setBreakpoint(file, line, condition);
  }

  public async removeBreakpoint(id: string): Promise<void> {
    return this.session.removeBreakpoint(id);
  }

  public async stepOver(): Promise<DebugState> {
    return this.session.stepOver();
  }

  public async stepInto(): Promise<DebugState> {
    return this.session.stepInto();
  }

  public async stepOut(): Promise<DebugState> {
    return this.session.stepOut();
  }

  public async evaluate(expression: string): Promise<EvaluationResult> {
    return this.session.evaluate(expression);
  }

  public async getStackTrace(): Promise<StackFrame[]> {
    return this.session.getStackTrace();
  }

  public async getScopes(frameId: number): Promise<Scope[]> {
    return this.session.getScopes(frameId);
  }

  public onConsoleOutput(handler: ConsoleHandler): void {
    this.session.on('console', handler);
  }

  public onPaused(handler: PauseHandler): void {
    this.session.on('paused', handler);
  }

  public onResumed(handler: ResumeHandler): void {
    this.session.on('resumed', handler);
  }

  public onBreakpointResolved?(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.session.on('breakpointResolved', handler);
  }

  // Event handling methods
  public on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void {
    return this.session.on(event, handler);
  }

  public off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void {
    this.session.off(event, handler);
  }

  // Pause state management
  public async waitForPause(timeoutMs?: number): Promise<DebugState> {
    return this.session.waitForPause(timeoutMs);
  }

  public getCurrentState(): DebugState {
    return this.session.state;
  }
}

/**
 * Compatibility wrapper that makes EnhancedDebugSession look like the old DebugSession interface.
 *
 * Provides backward compatibility for code written against the legacy DebugSession interface
 * while internally delegating to the new EnhancedDebugSession implementation. This wrapper
 * enables incremental migration from the old API to the new event-driven API without breaking
 * existing code.
 *
 * Key features:
 * - Wraps EnhancedDebugSession in legacy DebugSession interface
 * - Proxies adapter methods through AdapterWrapper
 * - Provides getEnhancedSession() for direct access to new API
 * - Maintains compatibility with getters and event handlers
 * @example
 * ```typescript
 * // Legacy code continues to work
 * const wrapper = new SessionCompatibilityWrapper(enhancedSession);
 * await wrapper.adapter.stepOver();
 * console.log(wrapper.state.status);
 *
 * // New code can access enhanced features
 * const enhanced = wrapper.getEnhancedSession();
 * enhanced.on('paused', (state) => console.log('Paused!'));
 * ```
 * @public
 * @see file:./enhanced-debug-session.ts - EnhancedDebugSession implementation
 * @see file:./types/session.ts - DebugSession interface
 */
export class SessionCompatibilityWrapper implements DebugSession {
  public readonly id: string;
  public readonly adapter: Omit<IDebugAdapter, 'continue'>;
  public readonly request: DebugRequest;
  public readonly startTime: string;

  private _adapterWrapper: AdapterWrapper;

  public constructor(private enhancedSession: EnhancedDebugSession) {
    this.id = enhancedSession.id;
    this.request = enhancedSession.request;
    this.startTime = enhancedSession.startTime;
    this._adapterWrapper = new AdapterWrapper(enhancedSession);
    this.adapter = this._adapterWrapper;
  }

  public get breakpoints(): Map<string, BreakpointInfo> {
    // Convert readonly map to regular map for compatibility
    return new Map(this.enhancedSession.breakpoints);
  }

  public get state(): DebugState {
    return this.enhancedSession.state;
  }

  public get consoleOutput(): ConsoleMessage[] {
    return [...this.enhancedSession.consoleOutput];
  }

  public get metadata(): SessionMetadata | undefined {
    return this.enhancedSession.metadata;
  }

  public get lifecycleState(): SessionLifecycleState | undefined {
    return this.enhancedSession.lifecycleState;
  }

  public get cleanup():
    | {
        timeoutHandle?: NodeJS.Timeout;
        heartbeatHandle?: NodeJS.Timeout;
        resources: Set<string>;
      }
    | undefined {
    // For compatibility, return a minimal cleanup object
    return {
      resources: new Set<string>(),
    };
  }

  // Event handling methods
  public on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void {
    return this.enhancedSession.on(event, handler);
  }

  public off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void {
    this.enhancedSession.off(event, handler);
  }

  // Pause state management
  public async waitForPause(timeoutMs?: number): Promise<DebugState> {
    return this.enhancedSession.waitForPause(timeoutMs);
  }

  public getCurrentState(): DebugState {
    return this.enhancedSession.state;
  }

  /**
   * Retrieves the underlying EnhancedDebugSession for direct access to the modern API.
   *
   * Allows code to access new features like event-driven patterns, lifecycle state,
   * and improved type safety while maintaining backward compatibility with legacy code.
   * @returns The wrapped EnhancedDebugSession instance
   * @public
   * @see file:./enhanced-debug-session.ts - EnhancedDebugSession API
   */
  public getEnhancedSession(): EnhancedDebugSession {
    return this.enhancedSession;
  }
}
