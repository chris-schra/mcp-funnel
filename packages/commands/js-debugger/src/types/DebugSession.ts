import type { SessionLifecycleState } from './SessionLifecycleState.js';
import type { IDebugAdapter } from './IDebugAdapter.js';
import type { BreakpointInfo } from './BreakpointInfo.js';
import type { DebugState } from './DebugState.js';
import type { DebugRequest } from './DebugRequest.js';
import type { ConsoleMessage } from './ConsoleMessage.js';
import type { SessionMetadata } from './SessionMetadata.js';

export interface DebugSession {
  id: string;
  adapter: IDebugAdapter;
  request: DebugRequest;
  breakpoints: Map<string, BreakpointInfo>;
  state: DebugState;
  startTime: string;
  consoleOutput: ConsoleMessage[];
  // Enhanced cleanup and lifecycle management
  metadata?: SessionMetadata;
  lifecycleState?: SessionLifecycleState;
  cleanup?: {
    timeoutHandle?: NodeJS.Timeout;
    heartbeatHandle?: NodeJS.Timeout;
    resources: Set<string>; // track resource IDs for cleanup
  };
}
