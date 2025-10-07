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
 * Maps a CDP location to the public Location type, applying source map translation if available.
 * Translates from JavaScript (generated) coordinates to TypeScript (original) coordinates.
 * @param location - The CDP location to map
 * @param scripts - Map of script metadata for source map lookup
 * @returns Mapped location object with source-mapped coordinates
 */
export function mapLocation(
  location: CdpLocation,
  scripts: Map<string, import('../types/index.js').ScriptMetadata>,
): Location {
  const metadata = scripts.get(location.scriptId);

  // If no source map, return as-is (already in correct coordinates)
  if (!metadata?.sourceMap) {
    return {
      scriptId: location.scriptId,
      lineNumber: location.lineNumber,
      columnNumber: location.columnNumber,
    };
  }

  // Translate from JavaScript (generated) coordinates to TypeScript (original) coordinates
  // CDP uses 0-based line numbers, source-map uses 1-based
  const originalPosition = metadata.sourceMap.consumer.originalPositionFor({
    line: location.lineNumber + 1,
    column: location.columnNumber ?? 0,
  });

  // If source map lookup fails, fall back to original coordinates
  if (!originalPosition.line) {
    return {
      scriptId: location.scriptId,
      lineNumber: location.lineNumber,
      columnNumber: location.columnNumber,
    };
  }

  return {
    scriptId: location.scriptId,
    lineNumber: originalPosition.line - 1, // Convert back to 0-based
    columnNumber: originalPosition.column ?? 0,
  };
}

/**
 * Extracts a JSON-safe value from an unknown value.
 * @param value - The value to convert to JSON-safe format
 * @returns JSON-safe value, bigint, or undefined if not convertible
 */
export function extractJsonValue(value: unknown): JsonValue | bigint | undefined {
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
 * @param remote - The CDP remote object to render
 * @returns String representation of the remote object
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
 * @param remote - The CDP remote object to convert
 * @returns RemoteObjectSummary representation
 */
export function toRemoteObjectSummary(remote: CdpRemoteObject): RemoteObjectSummary {
  const summary: RemoteObjectSummary = {
    type: remote.type,
  };
  if (remote.subtype) summary.subtype = remote.subtype;
  if (remote.className) summary.className = remote.className;
  if (remote.description) summary.description = remote.description;
  const value = extractJsonValue(remote.value);
  if (value !== undefined) summary.value = value;
  if (remote.unserializableValue) summary.unserializableValue = remote.unserializableValue;
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
 * @param scope - The CDP scope to map
 * @param scripts - Map of script metadata for source map lookup
 * @returns Mapped scope object
 */
export function mapScope(
  scope: CdpScope,
  scripts: Map<string, import('../types/index.js').ScriptMetadata>,
): Scope {
  return {
    type: scope.type,
    object: toRemoteObjectSummary(scope.object),
    name: scope.name,
    startLocation: scope.startLocation ? mapLocation(scope.startLocation, scripts) : undefined,
    endLocation: scope.endLocation ? mapLocation(scope.endLocation, scripts) : undefined,
  };
}

/**
 * Maps a CDP call frame to the public DebuggerCallFrame type.
 * @param frame - The CDP call frame to map
 * @param scripts - Map of script metadata for source map lookup
 * @returns Mapped call frame object
 */
export function mapCallFrame(
  frame: CdpCallFrame,
  scripts: Map<string, import('../types/index.js').ScriptMetadata>,
): DebuggerCallFrame {
  return {
    callFrameId: frame.callFrameId,
    functionName: frame.functionName,
    functionLocation: frame.functionLocation
      ? mapLocation(frame.functionLocation, scripts)
      : undefined,
    location: mapLocation(frame.location, scripts),
    url: frame.url,
    scopeChain: frame.scopeChain.map((scope) => mapScope(scope, scripts)),
    this: toRemoteObjectSummary(frame.this),
    returnValue: frame.returnValue ? toRemoteObjectSummary(frame.returnValue) : undefined,
    canBeRestarted: frame.canBeRestarted,
  };
}

/**
 * Maps a CDP stack trace to the public StackTrace type.
 * @param trace - The CDP stack trace to map
 * @returns Mapped stack trace object or undefined if input is falsy
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
 * @param details - The CDP exception details to map
 * @returns Mapped exception details object
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
    exception: details.exception ? toRemoteObjectSummary(details.exception) : undefined,
    executionContextId: details.executionContextId,
  };
}

/**
 * Maps a console type string to the ConsoleLevel enum.
 * @param type - The console type string to map
 * @returns Corresponding ConsoleLevel enum value
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
 * @param remote - The CDP remote object to convert
 * @returns Console argument with both remote object and text representation
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
 * @param level - The console log level
 * @param origin - The console entry origin (console-api, network, etc.)
 * @param args - Array of CDP remote objects representing console arguments
 * @param timestamp - The timestamp of the console entry
 * @param stackTrace - Optional stack trace associated with the console entry
 * @returns Complete console entry with processed arguments and metadata
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
 * @param details - The CDP exception details to convert
 * @param timestamp - The timestamp of the exception
 * @returns Exception entry with processed details and text
 */
export function createExceptionEntry(
  details: CdpExceptionDetails,
  timestamp: number,
): ExceptionEntry {
  const mapped = mapException(details);
  const text =
    mapped.exception?.description || mapped.exception?.unserializableValue || mapped.text;
  return {
    text,
    details: mapped,
    timestamp: Math.floor(timestamp),
  };
}
