import type {
  ConsoleArgument,
  ConsoleEntry,
  ConsoleLevel,
  DebuggerCallFrame,
  ExceptionDetails,
  ExceptionEntry,
  JsonValue,
  Location,
  RemoteObjectSummary,
  Scope,
  StackTrace,
} from '../types/index.js';
import type {
  CdpCallFrame,
  CdpExceptionDetails,
  CdpLocation,
  CdpRemoteObject,
  CdpScope,
  CdpStackTrace,
} from './session-types.js';

/**
 * Maps a CDP location to the public Location type.
 * @param location
 */
export function mapLocation(location: CdpLocation): Location {
  return {
    scriptId: location.scriptId,
    lineNumber: location.lineNumber,
    columnNumber: location.columnNumber,
  };
}

/**
 * Extracts a JSON-safe value from an unknown value.
 * @param value
 */
export function extractJsonValue(
  value: unknown,
): JsonValue | bigint | undefined {
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return value;
    case 'bigint':
      return value;
    case 'object':
      try {
        const serialized = JSON.stringify(value);
        return serialized ? (JSON.parse(serialized) as JsonValue) : undefined;
      } catch {
        return undefined;
      }
    default:
      return undefined;
  }
}

/**
 * Renders a CDP remote object as a string for display.
 * @param remote
 */
export function renderRemoteObject(remote: CdpRemoteObject): string {
  if (remote.unserializableValue) {
    return remote.unserializableValue;
  }
  if (remote.value !== undefined && remote.value !== null) {
    if (typeof remote.value === 'string') {
      return remote.value;
    }
    if (typeof remote.value === 'number' || typeof remote.value === 'boolean') {
      return String(remote.value);
    }
    if (typeof remote.value === 'bigint') {
      return `${remote.value}n`;
    }
    try {
      return JSON.stringify(remote.value);
    } catch {
      // ignore
    }
  }
  if (remote.description) {
    return remote.description;
  }
  return `<${remote.type}>`;
}

/**
 * Converts a CDP remote object to a public RemoteObjectSummary.
 * @param remote
 */
export function toRemoteObjectSummary(
  remote: CdpRemoteObject,
): RemoteObjectSummary {
  const summary: RemoteObjectSummary = {
    type: remote.type,
  };
  if (remote.subtype) summary.subtype = remote.subtype;
  if (remote.className) summary.className = remote.className;
  if (remote.description) summary.description = remote.description;
  const value = extractJsonValue(remote.value);
  if (value !== undefined) summary.value = value;
  if (remote.unserializableValue)
    summary.unserializableValue = remote.unserializableValue;
  if (remote.objectId) summary.objectId = remote.objectId;
  if (remote.preview?.description) {
    summary.preview = remote.preview.description;
  } else if (remote.description) {
    summary.preview = remote.description;
  }
  return summary;
}

/**
 * Maps a CDP scope to the public Scope type.
 * @param scope
 */
export function mapScope(scope: CdpScope): Scope {
  return {
    type: scope.type,
    object: toRemoteObjectSummary(scope.object),
    name: scope.name,
    startLocation: scope.startLocation
      ? mapLocation(scope.startLocation)
      : undefined,
    endLocation: scope.endLocation ? mapLocation(scope.endLocation) : undefined,
  };
}

/**
 * Maps a CDP call frame to the public DebuggerCallFrame type.
 * @param frame
 */
export function mapCallFrame(frame: CdpCallFrame): DebuggerCallFrame {
  return {
    callFrameId: frame.callFrameId,
    functionName: frame.functionName,
    functionLocation: frame.functionLocation
      ? mapLocation(frame.functionLocation)
      : undefined,
    location: mapLocation(frame.location),
    url: frame.url,
    scopeChain: frame.scopeChain.map(mapScope),
    this: toRemoteObjectSummary(frame.this),
    returnValue: frame.returnValue
      ? toRemoteObjectSummary(frame.returnValue)
      : undefined,
    canBeRestarted: frame.canBeRestarted,
  };
}

/**
 * Maps a CDP stack trace to the public StackTrace type.
 * @param trace
 */
export function mapStackTrace(trace?: CdpStackTrace): StackTrace | undefined {
  if (!trace) {
    return undefined;
  }
  return {
    description: trace.description,
    callFrames: trace.callFrames.map((frame) => ({
      functionName: frame.functionName,
      scriptId: frame.scriptId,
      url: frame.url,
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber ?? 0,
    })),
    parent: mapStackTrace(trace.parent),
    parentId: trace.parentId ? { ...trace.parentId } : undefined,
  };
}

/**
 * Maps CDP exception details to the public ExceptionDetails type.
 * @param details
 */
export function mapException(details: CdpExceptionDetails): ExceptionDetails {
  return {
    exceptionId: details.exceptionId,
    text: details.text,
    lineNumber: details.lineNumber,
    columnNumber: details.columnNumber,
    scriptId: details.scriptId,
    url: details.url,
    stackTrace: mapStackTrace(details.stackTrace),
    exception: details.exception
      ? toRemoteObjectSummary(details.exception)
      : undefined,
    executionContextId: details.executionContextId,
  };
}

/**
 * Maps a console type string to the ConsoleLevel enum.
 * @param type
 */
export function mapConsoleLevel(type: string): ConsoleLevel {
  switch (type) {
    case 'error':
    case 'assert':
      return 'error';
    case 'warning':
      return 'warn';
    case 'info':
      return 'info';
    case 'debug':
    case 'trace':
      return 'debug';
    default:
      return 'log';
  }
}

/**
 * Converts a CDP remote object to a console argument.
 * @param remote
 */
export function toConsoleArgument(remote: CdpRemoteObject): ConsoleArgument {
  const summary = toRemoteObjectSummary(remote);
  return {
    remote: summary,
    text: renderRemoteObject(remote),
  };
}

/**
 * Builds a console entry from CDP data.
 * @param level
 * @param origin
 * @param args
 * @param timestamp
 * @param stackTrace
 */
export function buildConsoleEntry(
  level: ConsoleLevel,
  origin: ConsoleEntry['origin'],
  args: CdpRemoteObject[],
  timestamp: number,
  stackTrace?: CdpStackTrace,
): ConsoleEntry {
  const argumentsList = args.map(toConsoleArgument);
  const text = argumentsList.map((arg) => arg.text).join(' ');
  return {
    level,
    origin,
    text,
    arguments: argumentsList,
    timestamp: Math.floor(timestamp),
    stackTrace: mapStackTrace(stackTrace),
  };
}

/**
 * Creates an exception entry from CDP exception details.
 * @param details
 * @param timestamp
 */
export function createExceptionEntry(
  details: CdpExceptionDetails,
  timestamp: number,
): ExceptionEntry {
  const mapped = mapException(details);
  const text =
    mapped.exception?.description ||
    mapped.exception?.unserializableValue ||
    mapped.text;
  return {
    text,
    details: mapped,
    timestamp: Math.floor(timestamp),
  };
}
