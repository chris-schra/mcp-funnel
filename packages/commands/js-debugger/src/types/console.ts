import type { StackFrame } from './evaluation.js';

export interface ConsoleMessage {
  level: 'log' | 'debug' | 'info' | 'warn' | 'error' | 'trace';
  timestamp: string;
  message: string;
  args: unknown[];
  stackTrace?: StackFrame[];
}

export type ConsoleHandler = (message: ConsoleMessage) => void;
