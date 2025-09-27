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
 * to maintain backward compatibility with the old DebugSession interface
 */
class AdapterWrapper implements Omit<IDebugAdapter, 'continue'> {
  constructor(private session: EnhancedDebugSession) {}

  async connect(_target: string): Promise<void> {
    // This is handled by the session during initialization
    throw new Error('connect() should not be called on wrapped adapter');
  }

  async disconnect(): Promise<void> {
    return this.session.terminate();
  }

  async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    return this.session.setBreakpoint(file, line, condition);
  }

  async removeBreakpoint(id: string): Promise<void> {
    return this.session.removeBreakpoint(id);
  }

  async stepOver(): Promise<DebugState> {
    return this.session.stepOver();
  }

  async stepInto(): Promise<DebugState> {
    return this.session.stepInto();
  }

  async stepOut(): Promise<DebugState> {
    return this.session.stepOut();
  }

  async evaluate(expression: string): Promise<EvaluationResult> {
    return this.session.evaluate(expression);
  }

  async getStackTrace(): Promise<StackFrame[]> {
    return this.session.getStackTrace();
  }

  async getScopes(frameId: number): Promise<Scope[]> {
    return this.session.getScopes(frameId);
  }

  onConsoleOutput(handler: ConsoleHandler): void {
    this.session.on('console', handler);
  }

  onPaused(handler: PauseHandler): void {
    this.session.on('paused', handler);
  }

  onResumed(handler: ResumeHandler): void {
    this.session.on('resumed', handler);
  }

  onBreakpointResolved?(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.session.on('breakpointResolved', handler);
  }

  // Event handling methods
  on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void {
    return this.session.on(event, handler);
  }

  off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void {
    this.session.off(event, handler);
  }

  // Pause state management
  async waitForPause(timeoutMs?: number): Promise<DebugState> {
    return this.session.waitForPause(timeoutMs);
  }

  getCurrentState(): DebugState {
    return this.session.state;
  }
}

/**
 * Compatibility wrapper that makes EnhancedDebugSession look like the old DebugSession interface
 */
export class SessionCompatibilityWrapper implements DebugSession {
  public readonly id: string;
  public readonly adapter: Omit<IDebugAdapter, 'continue'>;
  public readonly request: DebugRequest;
  public readonly startTime: string;

  private _adapterWrapper: AdapterWrapper;

  constructor(private enhancedSession: EnhancedDebugSession) {
    this.id = enhancedSession.id;
    this.request = enhancedSession.request;
    this.startTime = enhancedSession.startTime;
    this._adapterWrapper = new AdapterWrapper(enhancedSession);
    this.adapter = this._adapterWrapper;
  }

  get breakpoints(): Map<string, BreakpointInfo> {
    // Convert readonly map to regular map for compatibility
    return new Map(this.enhancedSession.breakpoints);
  }

  get state(): DebugState {
    return this.enhancedSession.state;
  }

  get consoleOutput(): ConsoleMessage[] {
    return [...this.enhancedSession.consoleOutput];
  }

  get metadata(): SessionMetadata | undefined {
    return this.enhancedSession.metadata;
  }

  get lifecycleState(): SessionLifecycleState | undefined {
    return this.enhancedSession.lifecycleState;
  }

  get cleanup():
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
  on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void {
    return this.enhancedSession.on(event, handler);
  }

  off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void {
    this.enhancedSession.off(event, handler);
  }

  // Pause state management
  async waitForPause(timeoutMs?: number): Promise<DebugState> {
    return this.enhancedSession.waitForPause(timeoutMs);
  }

  getCurrentState(): DebugState {
    return this.enhancedSession.state;
  }

  /**
   * Get the underlying EnhancedDebugSession for direct access to new API
   */
  getEnhancedSession(): EnhancedDebugSession {
    return this.enhancedSession;
  }
}
