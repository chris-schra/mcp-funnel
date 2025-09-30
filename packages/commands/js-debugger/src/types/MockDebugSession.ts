import { DebugRequest } from './DebugRequest.js';

/**
 * Mock session structure
 */
export interface MockDebugSession {
  request: DebugRequest;
  currentBreakpointIndex: number;
  events: Array<Record<string, unknown>>;
  startTime: string;
  consoleOutput: Array<{
    level: 'log' | 'debug' | 'info' | 'warn' | 'error';
    timestamp: string;
    message: string;
    args: unknown[];
  }>;
}
