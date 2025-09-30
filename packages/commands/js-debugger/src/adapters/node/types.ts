// CDP Domain interfaces for type safety
import type { ICDPClient } from '../../types/index.js';

export interface NodeCDPBreakpoint {
  breakpointId: string;
  locations: Array<{
    scriptId: string;
    lineNumber: number;
    columnNumber?: number;
  }>;
}

export interface NodeCDPPausedEventParams {
  reason: 'breakpoint' | 'step' | 'exception' | 'other';
  data?: unknown;
  callFrames: Array<{
    callFrameId: string;
    functionName: string;
    location: {
      scriptId: string;
      lineNumber: number;
      columnNumber?: number;
    };
    url?: string;
    scopeChain: Array<{
      type: 'global' | 'local' | 'closure' | 'with' | 'catch';
      object: {
        objectId?: string;
        type: string;
        className?: string;
        description?: string;
      };
      name?: string;
    }>;
  }>;
  exception?: {
    type: string;
    value?: unknown;
    description?: string;
    className?: string;
  };
}

export interface NodeCDPScriptParsedEventParams {
  scriptId: string;
  url: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  executionContextId: number;
  hash: string;
}

export interface NodeCDPConsoleAPICalledEventParams {
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
    objectId?: string;
  }>;
  executionContextId: number;
  timestamp: number;
  stackTrace?: {
    callFrames: Array<{
      functionName: string;
      scriptId: string;
      url: string;
      lineNumber: number;
      columnNumber: number;
    }>;
  };
}

export type NodeDebugAdapterOptions = {
  cdpClient?: ICDPClient;
  request?: {
    command?: string;
  };
};
