export interface IDebugAdapter {
  connect(target: string): Promise<void>;
  disconnect(): Promise<void>;
  setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<string>;
  removeBreakpoint(id: string): Promise<void>;
  continue(): Promise<DebugState>;
  stepOver(): Promise<DebugState>;
  stepInto(): Promise<DebugState>;
  stepOut(): Promise<DebugState>;
  evaluate(expression: string): Promise<EvaluationResult>;
  getStackTrace(): Promise<StackFrame[]>;
  getScopes(frameId: number): Promise<Scope[]>;
  onConsoleOutput(handler: ConsoleHandler): void;
  onPaused(handler: PauseHandler): void;
  onResumed(handler: ResumeHandler): void;
}

export interface DebugState {
  status: 'running' | 'paused' | 'terminated';
  pauseReason?: 'breakpoint' | 'step' | 'exception' | 'entry';
  breakpoint?: BreakpointInfo;
  exception?: ExceptionInfo;
}

export interface BreakpointInfo {
  id: string;
  file: string;
  line: number;
  condition?: string;
}

export interface ExceptionInfo {
  message: string;
  stack?: string;
  uncaught: boolean;
}

export interface StackFrame {
  id: number;
  functionName: string;
  file: string;
  line: number;
  column?: number;
}

export interface Scope {
  type: 'global' | 'local' | 'closure' | 'with' | 'catch';
  name?: string;
  variables: Variable[];
}

export interface Variable {
  name: string;
  value: unknown;
  type: string;
  configurable?: boolean;
  enumerable?: boolean;
}

export interface EvaluationResult {
  value: unknown;
  type: string;
  description?: string;
  error?: string;
}

export interface ConsoleMessage {
  level: 'log' | 'debug' | 'info' | 'warn' | 'error' | 'trace';
  timestamp: string;
  message: string;
  args: unknown[];
  stackTrace?: StackFrame[];
}

export type ConsoleHandler = (message: ConsoleMessage) => void;
export type PauseHandler = (state: DebugState) => void;
export type ResumeHandler = () => void;

export interface DebugRequest {
  platform: 'node' | 'browser';
  target: string;
  command?: string; // Runtime command for Node (e.g., "node", "tsx", "ts-node")
  breakpoints?: Array<{
    file: string;
    line: number;
    condition?: string;
  }>;
  timeout?: number;
  evalExpressions?: string[];
  captureConsole?: boolean;
  consoleVerbosity?: 'all' | 'warn-error' | 'error-only' | 'none';
}

export interface DebugSession {
  id: string;
  adapter: IDebugAdapter;
  request: DebugRequest;
  breakpoints: Map<string, BreakpointInfo>;
  state: DebugState;
  startTime: string;
  consoleOutput: ConsoleMessage[];
}

export interface ISessionManager {
  createSession(request: DebugRequest): Promise<string>;
  getSession(id: string): DebugSession | undefined;
  deleteSession(id: string): void;
  listSessions(): Array<{
    id: string;
    platform: string;
    target: string;
    state: DebugState;
    startTime: string;
  }>;
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
