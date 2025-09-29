import type { StackFrame } from './StackFrame.js';

export interface ConsoleMessage {
  level: 'log' | 'debug' | 'info' | 'warn' | 'error' | 'trace';
  timestamp: string;
  message: string;
  args: unknown[];
  stackTrace?: StackFrame[];
}
