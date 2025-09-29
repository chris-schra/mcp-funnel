import type { BreakpointInfo, ExceptionInfo } from './index.js';

export interface DebugState {
  status: 'running' | 'paused' | 'terminated';
  pauseReason?: 'breakpoint' | 'step' | 'exception' | 'entry';
  breakpoint?: BreakpointInfo;
  exception?: ExceptionInfo;
}
