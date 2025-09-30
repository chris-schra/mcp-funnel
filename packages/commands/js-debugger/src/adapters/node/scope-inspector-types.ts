/**
 * CDP type definitions for ScopeInspector.
 *
 * Contains internal type definitions matching Chrome DevTools Protocol structures
 * used during scope inspection and variable retrieval.
 * @internal
 */

/**
 * CDP Scope interface matching the structure from pause events.
 *
 * Represents the raw scope chain structure returned by Chrome DevTools Protocol
 * when the debugger pauses execution. Each scope contains an object reference
 * and metadata about the scope's location in the source code.
 * @internal
 * @see file:../../types/evaluation.ts:13 - Public Scope interface
 */
export interface CDPScope {
  type:
    | 'global'
    | 'local'
    | 'closure'
    | 'module'
    | 'with'
    | 'catch'
    | 'block'
    | 'script'
    | 'eval';
  object: {
    objectId?: string;
    type: string;
    className?: string;
    description?: string;
    value?: unknown;
  };
  name?: string;
  startLocation?: {
    scriptId: string;
    lineNumber: number;
    columnNumber: number;
  };
  endLocation?: {
    scriptId: string;
    lineNumber: number;
    columnNumber: number;
  };
}

/**
 * CDP Property descriptor from Runtime.getProperties.
 *
 * Represents a single property descriptor returned by the CDP Runtime.getProperties
 * command, including metadata about configurability, enumerability, and accessor functions.
 * @internal
 */
export interface CDPPropertyDescriptor {
  name: string;
  value?: {
    type: string;
    value?: unknown;
    description?: string;
    objectId?: string;
    className?: string;
  };
  writable?: boolean;
  get?: {
    type: string;
    objectId?: string;
  };
  set?: {
    type: string;
    objectId?: string;
  };
  configurable?: boolean;
  enumerable?: boolean;
  wasThrown?: boolean;
  isOwn?: boolean;
  symbol?: {
    type: string;
    description?: string;
    objectId?: string;
  };
}

/**
 * Response from Runtime.getProperties.
 *
 * Contains all properties (regular, internal, and private) of an object
 * along with any exception details if the operation failed.
 * @internal
 */
export interface CDPGetPropertiesResponse {
  result: CDPPropertyDescriptor[];
  internalProperties?: CDPPropertyDescriptor[];
  privateProperties?: CDPPropertyDescriptor[];
  exceptionDetails?: unknown;
}

/**
 * Response from Debugger.evaluateOnCallFrame.
 *
 * Contains the evaluation result along with any exception details or error indicators.
 * Note: Despite the interface name, this is used for evaluateOnCallFrame, not Runtime.evaluate.
 * @internal
 */
export interface CDPEvaluateResponse {
  result: {
    type: string;
    value?: unknown;
    description?: string;
    objectId?: string;
    className?: string;
  };
  exceptionDetails?: {
    exceptionId: number;
    text: string;
    lineNumber: number;
    columnNumber: number;
    scriptId?: string;
    url?: string;
    stackTrace?: unknown;
    exception?: unknown;
  };
  wasThrown?: boolean;
}

/**
 * CDP value object structure.
 *
 * Represents a value in the Chrome DevTools Protocol format, which can be
 * a primitive, object reference, or complex type requiring further inspection.
 * @internal
 */
export interface CDPValue {
  type: string;
  value?: unknown;
  description?: string;
  objectId?: string;
  className?: string;
}
