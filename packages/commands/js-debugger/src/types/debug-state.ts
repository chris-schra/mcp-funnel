export type CodeOrigin = 'user' | 'internal' | 'library' | 'unknown';

export interface DebugLocation {
  type: CodeOrigin;
  file?: string;
  line?: number;
  column?: number;
  description?: string;
  relativePath?: string;
}

export interface DebugState {
  status: 'running' | 'paused' | 'terminated';
  pauseReason?: 'breakpoint' | 'step' | 'exception' | 'entry' | 'debugger';
  breakpoint?: import('./breakpoint.js').BreakpointInfo;
  exception?: ExceptionInfo;
  location?: DebugLocation;
  hint?: string;
}

export interface ExceptionInfo {
  message: string;
  stack?: string;
  uncaught: boolean;
}
