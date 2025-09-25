/**
 * Debug adapters for different JavaScript runtime environments
 */

export { BrowserAdapter } from './browser-adapter.js';
export { NodeDebugAdapter } from './node-adapter.js';
export { MockSessionManager } from './mock-session-manager.js';

// Re-export types for convenience
export type {
  IDebugAdapter,
  DebugState,
  EvaluationResult,
  StackFrame,
  Scope,
  Variable,
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
  ConsoleMessage,
  IMockSessionManager,
  MockDebugSession,
} from '../types.js';
