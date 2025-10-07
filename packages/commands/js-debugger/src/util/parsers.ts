import type {
  BreakpointLocation,
  BreakpointMutation,
  BreakpointSpec,
  DebuggerCommand,
  DebugSessionConfig,
  OutputQuery,
  ScopePathSegment,
  ScopeQuery,
} from '../types/index.js';
import {
  expectBoolean,
  expectNumber,
  expectRecord,
  expectString,
  optionalBoolean,
  optionalString,
  optionalStringArray,
  optionalStringRecord,
} from './validation.js';

/**
 * Parses debug session configuration from input arguments
 * @param input - Raw input arguments
 * @returns Parsed debug session configuration
 * @throws Error if input is invalid
 */
export function parseDebugSessionConfig(input: Record<string, unknown>): DebugSessionConfig {
  const id = optionalString(input.id, 'id');
  const target = expectRecord(input.target, 'target');
  const targetType = expectString(target.type, 'target.type');

  if (targetType !== 'node') {
    throw new Error('Only Node.js targets are supported.');
  }

  const entry = expectString(target.entry, 'target.entry');

  const nodeTarget = {
    type: 'node' as const,
    entry,
    entryArguments: optionalStringArray(target.entryArguments, 'target.entryArguments'),
    cwd: optionalString(target.cwd, 'target.cwd'),
    env: optionalStringRecord(target.env, 'target.env'),
    useTsx: optionalBoolean(target.useTsx, 'target.useTsx'),
    runtimeArguments: optionalStringArray(target.runtimeArguments, 'target.runtimeArguments'),
    nodePath: optionalString(target.nodePath, 'target.nodePath'),
    inspectHost: optionalString(target.inspectHost, 'target.inspectHost'),
  } satisfies DebugSessionConfig['target'];

  const config: DebugSessionConfig = { id, target: nodeTarget };

  if (input.breakpoints !== undefined) {
    config.breakpoints = parseBreakpointArray(input.breakpoints, 'breakpoints');
  }
  if (input.resumeAfterConfigure !== undefined) {
    config.resumeAfterConfigure = expectBoolean(input.resumeAfterConfigure, 'resumeAfterConfigure');
  }

  return config;
}

/**
 * Parses debugger command from input arguments
 * @param input - Raw input arguments
 * @returns Parsed debugger command
 * @throws Error if input is invalid
 */
export function parseDebuggerCommand(input: Record<string, unknown>): DebuggerCommand {
  const sessionId = expectString(input.sessionId, 'sessionId');
  const action = expectString(input.action, 'action');
  const breakpoints = parseBreakpointMutation(input.breakpoints);

  switch (action) {
    case 'continue':
      return { sessionId, action: 'continue', breakpoints };
    case 'pause':
      return { sessionId, action: 'pause', breakpoints };
    case 'stepInto':
      return { sessionId, action: 'stepInto', breakpoints };
    case 'stepOver':
      return { sessionId, action: 'stepOver', breakpoints };
    case 'stepOut':
      return { sessionId, action: 'stepOut', breakpoints };
    case 'continueToLocation': {
      const locationInput = expectRecord(input.location, 'location');
      const location = parseBreakpointLocation(locationInput, 'location');
      return { sessionId, action: 'continueToLocation', location, breakpoints };
    }
    default:
      throw new Error(`Unsupported debugger action: ${action}`);
  }
}

/**
 * Parses scope query from input arguments
 * @param input - Raw input arguments
 * @returns Parsed scope query
 * @throws Error if input is invalid
 */
export function parseScopeQuery(input: Record<string, unknown>): ScopeQuery {
  const sessionId = expectString(input.sessionId, 'sessionId');
  const callFrameId = expectString(input.callFrameId, 'callFrameId');
  const scopeNumber = expectNumber(input.scopeNumber, 'scopeNumber');
  const path = input.path ? parseScopePath(input.path, 'path') : undefined;
  const depth = input.depth !== undefined ? expectNumber(input.depth, 'depth') : undefined;
  const maxProperties =
    input.maxProperties !== undefined
      ? expectNumber(input.maxProperties, 'maxProperties')
      : undefined;

  return { sessionId, callFrameId, scopeNumber, path, depth, maxProperties };
}

/**
 * Parses output query from input arguments
 * @param input - Raw input arguments
 * @returns Parsed output query
 * @throws Error if input is invalid
 */
export function parseOutputQuery(input: Record<string, unknown>): OutputQuery {
  const sessionId = expectString(input.sessionId, 'sessionId');
  const since = input.since !== undefined ? expectNumber(input.since, 'since') : undefined;
  const limit = input.limit !== undefined ? expectNumber(input.limit, 'limit') : undefined;
  const search = optionalString(input.search, 'search');

  const streams = input.streams ? optionalStringArray(input.streams, 'streams') : undefined;
  if (streams) {
    for (const stream of streams) {
      if (stream !== 'stdout' && stream !== 'stderr') {
        throw new Error(`streams entries must be 'stdout' or 'stderr' (received ${stream}).`);
      }
    }
  }

  const levels = input.levels ? optionalStringArray(input.levels, 'levels') : undefined;
  if (levels) {
    for (const level of levels) {
      if (!['log', 'error', 'warn', 'info', 'debug'].includes(level)) {
        throw new Error(`Invalid console level '${level}'.`);
      }
    }
  }

  const includeExceptions =
    input.includeExceptions !== undefined
      ? expectBoolean(input.includeExceptions, 'includeExceptions')
      : undefined;

  return {
    sessionId,
    since,
    limit,
    streams: streams as OutputQuery['streams'],
    levels: levels as OutputQuery['levels'],
    includeExceptions,
    search,
  };
}

/**
 * Parses breakpoint mutation from input
 * @param value - Raw breakpoint mutation input
 * @returns Parsed breakpoint mutation or undefined
 * @throws Error if input is invalid
 */
function parseBreakpointMutation(value: unknown): BreakpointMutation | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = expectRecord(value, 'breakpoints');
  const mutation: BreakpointMutation = {};

  if (record.set !== undefined) {
    mutation.set = parseBreakpointArray(record.set, 'breakpoints.set');
  }
  if (record.remove !== undefined) {
    mutation.remove = optionalStringArray(record.remove, 'breakpoints.remove');
  }

  return mutation;
}

/**
 * Parses array of breakpoint specifications
 * @param value - Raw array input
 * @param label - Field label for error messages
 * @returns Array of parsed breakpoint specs
 * @throws Error if input is invalid
 */
function parseBreakpointArray(value: unknown, label: string): BreakpointSpec[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((entry, index) =>
    parseBreakpointSpec(expectRecord(entry, `${label}[${index}]`), `${label}[${index}]`),
  );
}

/**
 * Parses a single breakpoint specification
 * @param value - Raw breakpoint spec input
 * @param label - Field label for error messages
 * @returns Parsed breakpoint spec
 * @throws Error if input is invalid
 */
function parseBreakpointSpec(value: Record<string, unknown>, label: string): BreakpointSpec {
  const locationRecord = expectRecord(value.location, `${label}.location`);
  const location = parseBreakpointLocation(locationRecord, `${label}.location`);
  const condition = optionalString(value.condition, `${label}.condition`);
  return { location, condition };
}

/**
 * Parses breakpoint location from input
 * @param value - Raw location input
 * @param label - Field label for error messages
 * @returns Parsed breakpoint location
 * @throws Error if input is invalid
 */
function parseBreakpointLocation(
  value: Record<string, unknown>,
  label: string,
): BreakpointLocation {
  const lineNumber = expectNumber(value.lineNumber, `${label}.lineNumber`);
  const columnNumber =
    value.columnNumber !== undefined
      ? expectNumber(value.columnNumber, `${label}.columnNumber`)
      : undefined;
  const scriptId = optionalString(value.scriptId, `${label}.scriptId`);
  const url = optionalString(value.url, `${label}.url`);

  if (!scriptId && !url) {
    throw new Error(`${label} must include either scriptId or url.`);
  }

  return { scriptId, url, lineNumber, columnNumber };
}

/**
 * Parses scope path from input
 * @param value - Raw path input
 * @param label - Field label for error messages
 * @returns Array of parsed scope path segments
 * @throws Error if input is invalid
 */
function parseScopePath(value: unknown, label: string): ScopePathSegment[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((segment, index) => {
    if (typeof segment === 'string') {
      if (!segment.trim()) {
        throw new Error(`${label}[${index}] must be a non-empty string.`);
      }
      return { property: segment };
    }
    const record = expectRecord(segment, `${label}[${index}]`);
    if ('index' in record) {
      const idx = expectNumber(record.index, `${label}[${index}].index`);
      return { index: idx };
    }
    if ('property' in record) {
      const prop = expectString(record.property, `${label}[${index}].property`);
      return { property: prop };
    }
    throw new Error(`${label}[${index}] must include either "index" or "property".`);
  });
}
