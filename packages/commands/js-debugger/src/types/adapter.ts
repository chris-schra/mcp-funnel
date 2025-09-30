import type { DebugState } from './debug-state.js';
import type { BreakpointRegistration } from './breakpoint.js';
import type { EvaluationResult, StackFrame, Scope } from './evaluation.js';
import type {
  DebugSessionEvents,
  PauseHandler,
  ResumeHandler,
} from './events.js';
import type { ConsoleHandler } from './console.js';

export interface IDebugAdapter {
  connect(target: string): Promise<void>;
  disconnect(): Promise<void>;
  setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration>;
  removeBreakpoint(id: string): Promise<void>;
  continue(): Promise<DebugState>;
  stepOver(): Promise<DebugState>;
  stepInto(): Promise<DebugState>;
  stepOut(): Promise<DebugState>;
  evaluate(expression: string): Promise<EvaluationResult>;
  getStackTrace(): Promise<StackFrame[]>;
  getScopes(frameId: number): Promise<Scope[]>;

  // Event-driven interface using Emittery
  on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void;
  off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void;

  // Pause state management
  waitForPause(timeoutMs?: number): Promise<DebugState>;
  getCurrentState(): DebugState;

  // Legacy callback support for backward compatibility (deprecated)
  /** @deprecated Use on('console', handler) instead */
  onConsoleOutput?(handler: ConsoleHandler): void;
  /** @deprecated Use on('paused', handler) instead */
  onPaused?(handler: PauseHandler): void;
  /** @deprecated Use on('resumed', handler) instead */
  onResumed?(handler: ResumeHandler): void;
  /** @deprecated Use on('breakpointResolved', handler) instead */
  onBreakpointResolved?(
    handler: (registration: BreakpointRegistration) => void,
  ): void;
}

export interface ICDPClient {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  on(event: string, handler: (params: unknown) => void): void;
  off(event: string, handler: (params: unknown) => void): void;
}

// Enhanced CDP client interface with type-safe event handling
export interface ITypedCDPClient extends ICDPClient {
  // Overloaded method signatures for type-safe event handling
  on(event: 'Debugger.paused', handler: (params: unknown) => void): void;
  on(event: 'Debugger.resumed', handler: (params?: unknown) => void): void;
  on(
    event: 'Runtime.consoleAPICalled',
    handler: (params: unknown) => void,
  ): void;
  on(
    event: 'Runtime.exceptionThrown',
    handler: (params: unknown) => void,
  ): void;
  on(event: 'Debugger.scriptParsed', handler: (params: unknown) => void): void;
  on(
    event: 'Debugger.breakpointResolved',
    handler: (params: unknown) => void,
  ): void;
  on(event: string, handler: (params: unknown) => void): void;

  off(event: 'Debugger.paused', handler: (params: unknown) => void): void;
  off(event: 'Debugger.resumed', handler: (params?: unknown) => void): void;
  off(
    event: 'Runtime.consoleAPICalled',
    handler: (params: unknown) => void,
  ): void;
  off(
    event: 'Runtime.exceptionThrown',
    handler: (params: unknown) => void,
  ): void;
  off(event: 'Debugger.scriptParsed', handler: (params: unknown) => void): void;
  off(
    event: 'Debugger.breakpointResolved',
    handler: (params: unknown) => void,
  ): void;
  off(event: string, handler: (params: unknown) => void): void;
}

// IAdapterFactory could be added here in the future when needed
