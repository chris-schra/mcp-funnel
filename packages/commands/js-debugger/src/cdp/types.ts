/**
 * Chrome DevTools Protocol type definitions
 * Based on the official CDP specification
 */

export interface CDPCallFrame {
  callFrameId: string;
  functionName: string;
  location: {
    scriptId: string;
    lineNumber: number;
    columnNumber?: number;
  };
  url: string;
  scopeChain: Array<{
    type:
      | 'global'
      | 'local'
      | 'closure'
      | 'with'
      | 'catch'
      | 'block'
      | 'script'
      | 'eval'
      | 'module';
    object: {
      objectId?: string;
      type: string;
      className?: string;
      value?: unknown;
    };
    name?: string;
  }>;
  this: {
    objectId?: string;
    type: string;
    value?: unknown;
  };
}

export interface CDPBreakpoint {
  breakpointId: string;
  locations: Array<{
    scriptId: string;
    lineNumber: number;
    columnNumber?: number;
  }>;
}

export interface CDPDebuggerPausedParams {
  callFrames: CDPCallFrame[];
  reason:
    | 'ambiguous'
    | 'assert'
    | 'breakpoint'
    | 'CSPViolation'
    | 'debugCommand'
    | 'DOM'
    | 'EventListener'
    | 'exception'
    | 'instrumentation'
    | 'OOM'
    | 'other'
    | 'promiseRejection'
    | 'XHR';
  data?: unknown;
  hitBreakpoints?: string[];
}

export interface CDPScriptParsedParams {
  scriptId: string;
  url: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
  executionContextId: number;
  hash?: string;
  sourceMapURL?: string;
}

export interface CDPConsoleAPICalledParams {
  type:
    | 'log'
    | 'debug'
    | 'info'
    | 'error'
    | 'warning'
    | 'dir'
    | 'dirxml'
    | 'table'
    | 'trace'
    | 'clear'
    | 'startGroup'
    | 'startGroupCollapsed'
    | 'endGroup'
    | 'assert'
    | 'profile'
    | 'profileEnd'
    | 'count'
    | 'timeEnd';
  args: Array<{
    type: string;
    value?: unknown;
    description?: string;
  }>;
  executionContextId: number;
  timestamp: number;
  stackTrace?: CDPStackTrace;
}

export interface CDPExceptionThrownParams {
  exceptionDetails: {
    exception?: {
      description?: string;
      value?: unknown;
    };
    text: string;
    stackTrace?: CDPStackTrace;
  };
}

export interface CDPStackTrace {
  callFrames: Array<{
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber?: number;
  }>;
}

export interface CDPEvaluateResult {
  result: {
    type: string;
    value?: unknown;
    description?: string;
    objectId?: string;
  };
  exceptionDetails?: {
    exception: {
      description?: string;
    };
  };
}

export interface CDPRuntimeProperty {
  name: string;
  value: {
    type: string;
    value?: unknown;
    description?: string;
  };
  configurable?: boolean;
  enumerable?: boolean;
}

export interface CDPGetPropertiesResult {
  result: CDPRuntimeProperty[];
}
