import type {
  BreakpointSpec,
  BreakpointLocation,
  PauseDetails,
  RemoteObjectType,
  RemoteObjectSubtype,
  Scope,
} from '../types/index.js';

/**
 * Pending command waiting for CDP response.
 */
export interface PendingCommand {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

/**
 * Internal breakpoint record tracking CDP breakpoint state.
 */
export interface BreakpointRecord {
  id: string;
  cdpId: string;
  spec: BreakpointSpec;
  resolved: BreakpointLocation[];
}

/**
 * Events emitted by a debug session.
 */
export interface SessionEvents {
  paused: PauseDetails;
  resumed: undefined;
  terminated: { code: number | null; signal?: NodeJS.Signals | null };
}

/**
 * Chrome DevTools Protocol remote object representation.
 */
export interface CdpRemoteObject {
  type: RemoteObjectType;
  subtype?: RemoteObjectSubtype;
  className?: string;
  description?: string;
  value?: unknown;
  unserializableValue?: string;
  objectId?: string;
  preview?: { description?: string };
}

/**
 * Chrome DevTools Protocol property descriptor.
 */
export interface CdpPropertyDescriptor {
  name: string;
  value?: CdpRemoteObject;
  enumerable?: boolean;
  configurable?: boolean;
  writable?: boolean;
  get?: CdpRemoteObject;
  set?: CdpRemoteObject;
}

/**
 * Chrome DevTools Protocol location.
 */
export interface CdpLocation {
  scriptId: string;
  lineNumber: number;
  columnNumber?: number;
}

/**
 * Chrome DevTools Protocol scope.
 */
export interface CdpScope {
  type: Scope['type'];
  object: CdpRemoteObject;
  name?: string;
  startLocation?: CdpLocation;
  endLocation?: CdpLocation;
}

/**
 * Chrome DevTools Protocol call frame.
 */
export interface CdpCallFrame {
  callFrameId: string;
  functionName: string;
  functionLocation?: CdpLocation;
  location: CdpLocation;
  url: string;
  scopeChain: CdpScope[];
  this: CdpRemoteObject;
  returnValue?: CdpRemoteObject;
  canBeRestarted?: boolean;
}

/**
 * Chrome DevTools Protocol stack trace.
 */
export interface CdpStackTrace {
  description?: string;
  callFrames: Array<{
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber?: number;
  }>;
  parent?: CdpStackTrace;
  parentId?: {
    id: string;
    debuggerId?: string;
  };
}

/**
 * Chrome DevTools Protocol exception details.
 */
export interface CdpExceptionDetails {
  exceptionId: number;
  text: string;
  lineNumber: number;
  columnNumber: number;
  scriptId?: string;
  url?: string;
  stackTrace?: CdpStackTrace;
  exception?: CdpRemoteObject;
  executionContextId?: number;
  exceptionMetaData?: Record<string, unknown>;
}

/**
 * Console API called event from CDP.
 */
export interface ConsoleAPICalledEvent {
  type: string;
  args: CdpRemoteObject[];
  timestamp: number;
  stackTrace?: CdpStackTrace;
}

/**
 * Log entry from CDP.
 */
export interface LogEntry {
  text: string;
  level: string;
  timestamp: number;
  args?: CdpRemoteObject[];
}

/**
 * Script parsed event from CDP.
 */
export interface ScriptParsedEvent {
  scriptId: string;
  url?: string;
  sourceMapURL?: string;
}

/**
 * Normalized script reference for lookups.
 */
export interface NormalizedScriptReference {
  original: string;
  path?: string;
  fileUrl?: string;
}

/**
 * Generated location in transpiled code.
 */
export interface GeneratedLocation {
  lineNumber: number;
  columnNumber?: number;
}

/**
 * Pending breakpoint upgrade tracking.
 */
export interface PendingBreakpointUpgrade {
  recordId: string;
  reference: NormalizedScriptReference;
  keys: string[];
}

/**
 * Chrome DevTools Protocol message.
 */
export interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}
