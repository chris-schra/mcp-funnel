import type {
  ConsoleHandler,
  DebugState,
  EvaluationResult,
  PauseHandler,
  ResumeHandler,
  Scope,
  StackFrame,
} from './index.js';

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
