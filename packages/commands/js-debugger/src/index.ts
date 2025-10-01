import type { CallToolResult, ICommand, Tool } from '@mcp-funnel/commands-core';

import {
  type BreakpointLocation,
  type BreakpointMutation,
  type BreakpointSpec,
  type DebuggerCommand,
  type DebugSessionConfig,
  type OutputQuery,
  type ScopePathSegment,
  type ScopeQuery,
} from './types/index.js';
import { DebuggerSessionManager } from './debugger/session-manager.js';

const BOOLEAN = 'boolean';
const NUMBER = 'number';
const STRING = 'string';

export class JsDebuggerCommand implements ICommand {
  public readonly name = 'js-debugger';
  public readonly description =
    'Debug JavaScript applications using the Chrome DevTools Protocol.';
  private readonly manager = new DebuggerSessionManager();

  public getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'startDebugSession',
        description: 'Spawn a Node.js target and attach a debugger session.',
        inputSchema: startSessionSchema,
      },
      {
        name: 'debuggerCommand',
        description: 'Control execution flow for an existing debugger session.',
        inputSchema: debuggerCommandSchema,
      },
      {
        name: 'getScopeVariables',
        description: 'Inspect variables within a paused call frame scope.',
        inputSchema: scopeQuerySchema,
      },
      {
        name: 'queryOutput',
        description:
          'Retrieve buffered stdout, stderr, console, and exception output.',
        inputSchema: outputQuerySchema,
      },
    ];
  }

  public async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      switch (toolName) {
        case 'startDebugSession':
          return await this.handleStartSession(args);
        case 'debuggerCommand':
          return await this.handleDebuggerCommand(args);
        case 'getScopeVariables':
          return await this.handleScopeQuery(args);
        case 'queryOutput':
          return await this.handleOutputQuery(args);
        default:
          return errorResponse(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  public async executeViaCLI(_args: string[]): Promise<void> {
    console.error(
      'CLI execution is not implemented for js-debugger. Use the MCP interface.',
    );
  }

  private async handleStartSession(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const config = parseDebugSessionConfig(args);
    const response = await this.manager.startSession(config);
    return jsonResponse(response);
  }

  private async handleDebuggerCommand(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const command = parseDebuggerCommand(args);
    const result = await this.manager.runCommand(command);
    return jsonResponse(result);
  }

  private async handleScopeQuery(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const query = parseScopeQuery(args);
    const result = await this.manager.getScopeVariables(query);
    return jsonResponse(result);
  }

  private async handleOutputQuery(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const query = parseOutputQuery(args);
    const result = await this.manager.queryOutput(query);
    return jsonResponse(result);
  }
}

/**
 *
 * @param value
 */
function jsonResponse(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

/**
 *
 * @param message
 */
function errorResponse(message: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    isError: true,
  };
}

const breakpointLocationSchema = {
  type: 'object',
  properties: {
    scriptId: {
      type: STRING,
      description: 'Script identifier reported by CDP.',
    },
    url: {
      type: STRING,
      description: 'URL or absolute path to the script resource.',
    },
    lineNumber: { type: NUMBER, description: 'Zero-based line number.' },
    columnNumber: {
      type: NUMBER,
      description: 'Optional zero-based column number.',
    },
  },
  required: ['lineNumber'],
} as Tool['inputSchema'];

const breakpointSpecSchema = {
  type: 'object',
  properties: {
    location: breakpointLocationSchema,
    condition: {
      type: STRING,
      description: 'Optional JavaScript expression evaluated before pausing.',
    },
  },
  required: ['location'],
} as Tool['inputSchema'];

const breakpointMutationSchema = {
  type: 'object',
  properties: {
    set: {
      type: 'array',
      description: 'Breakpoints to set before executing the command.',
      items: breakpointSpecSchema,
    },
    remove: {
      type: 'array',
      description:
        'Breakpoint identifiers to remove before executing the command.',
      items: { type: STRING },
    },
  },
} as Tool['inputSchema'];

const startSessionSchema = {
  type: 'object',
  properties: {
    id: {
      type: STRING,
      description: 'Optional predefined session identifier.',
    },
    target: {
      type: 'object',
      description: 'Launch configuration for the debuggee runtime.',
      properties: {
        type: {
          type: STRING,
          enum: ['node'],
          description: 'Runtime category to launch (currently only `node`).',
        },
        entry: {
          type: STRING,
          description: 'Entry script path (absolute or relative to `cwd`).',
        },
        entryArguments: {
          type: 'array',
          items: { type: STRING },
          description: 'Arguments passed to the entry script.',
        },
        cwd: {
          type: STRING,
          description: 'Working directory for the spawned process.',
        },
        env: {
          type: 'object',
          additionalProperties: { type: STRING },
          description:
            'Environment variables merged onto the current process environment.',
        },
        useTsx: {
          type: BOOLEAN,
          description:
            'Inject `--import tsx/register` for TypeScript debugging.',
        },
        runtimeArguments: {
          type: 'array',
          items: { type: STRING },
          description:
            'Additional Node.js runtime flags (e.g., --trace-warnings).',
        },
        nodePath: {
          type: STRING,
          description: 'Path to the Node.js executable.',
        },
        inspectHost: {
          type: STRING,
          description:
            'Host interface for the inspector (defaults to 127.0.0.1).',
        },
      },
      required: ['type', 'entry'],
    },
    breakpoints: {
      type: 'array',
      description: 'Breakpoints to register before resuming execution.',
      items: breakpointSpecSchema,
    },
    resumeAfterConfigure: {
      type: BOOLEAN,
      description:
        'If true, resume execution after setup. Defaults to staying paused.',
    },
  },
  required: ['target'],
} as Tool['inputSchema'];

const debuggerCommandSchema = {
  type: 'object',
  properties: {
    sessionId: { type: STRING, description: 'Debugger session identifier.' },
    action: {
      type: STRING,
      enum: [
        'continue',
        'pause',
        'stepInto',
        'stepOver',
        'stepOut',
        'continueToLocation',
      ],
      description: 'Execution control command to perform.',
    },
    location: breakpointLocationSchema,
    breakpoints: breakpointMutationSchema,
  },
  required: ['sessionId', 'action'],
  allOf: [
    {
      if: { properties: { action: { const: 'continueToLocation' } } },
      then: { required: ['location'] },
    },
  ],
} as Tool['inputSchema'];

const scopePathSegmentSchema = {
  type: ['string', 'object'],
  properties: {
    index: { type: NUMBER },
    property: { type: STRING },
  },
  additionalProperties: false,
} as unknown as Tool['inputSchema'];

const scopeQuerySchema = {
  type: 'object',
  properties: {
    sessionId: { type: STRING, description: 'Debugger session identifier.' },
    callFrameId: {
      type: STRING,
      description: 'Identifier of the paused call frame.',
    },
    scopeNumber: {
      type: NUMBER,
      description: 'Zero-based index in the scope chain.',
    },
    path: {
      type: 'array',
      description:
        'Optional path navigating into nested properties before enumeration.',
      items: scopePathSegmentSchema,
    },
    depth: {
      type: NUMBER,
      description:
        'Traversal depth starting from the resolved object (default 1).',
    },
    maxProperties: {
      type: NUMBER,
      description: 'Maximum number of properties per depth level (default 25).',
    },
  },
  required: ['sessionId', 'callFrameId', 'scopeNumber'],
} as Tool['inputSchema'];

const outputQuerySchema = {
  type: 'object',
  properties: {
    sessionId: { type: STRING, description: 'Debugger session identifier.' },
    since: {
      type: NUMBER,
      description:
        'Return entries with cursor strictly greater than this value.',
    },
    limit: {
      type: NUMBER,
      description: 'Maximum number of entries to return (default 100).',
    },
    streams: {
      type: 'array',
      items: { type: STRING, enum: ['stdout', 'stderr'] },
      description: 'Restrict stdio output to the provided streams.',
    },
    levels: {
      type: 'array',
      items: { type: STRING, enum: ['log', 'error', 'warn', 'info', 'debug'] },
      description: 'Restrict console output to the provided levels.',
    },
    includeExceptions: {
      type: BOOLEAN,
      description: 'Include runtime exception entries (default true).',
    },
    search: {
      type: STRING,
      description: 'Case-insensitive substring search across rendered text.',
    },
  },
  required: ['sessionId'],
} as Tool['inputSchema'];

/**
 *
 * @param input
 */
function parseDebugSessionConfig(
  input: Record<string, unknown>,
): DebugSessionConfig {
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
    entryArguments: optionalStringArray(
      target.entryArguments,
      'target.entryArguments',
    ),
    cwd: optionalString(target.cwd, 'target.cwd'),
    env: optionalStringRecord(target.env, 'target.env'),
    useTsx: optionalBoolean(target.useTsx, 'target.useTsx'),
    runtimeArguments: optionalStringArray(
      target.runtimeArguments,
      'target.runtimeArguments',
    ),
    nodePath: optionalString(target.nodePath, 'target.nodePath'),
    inspectHost: optionalString(target.inspectHost, 'target.inspectHost'),
  } satisfies DebugSessionConfig['target'];

  const config: DebugSessionConfig = { id, target: nodeTarget };

  if (input.breakpoints !== undefined) {
    config.breakpoints = parseBreakpointArray(input.breakpoints, 'breakpoints');
  }
  if (input.resumeAfterConfigure !== undefined) {
    config.resumeAfterConfigure = expectBoolean(
      input.resumeAfterConfigure,
      'resumeAfterConfigure',
    );
  }

  return config;
}

/**
 *
 * @param input
 */
function parseDebuggerCommand(input: Record<string, unknown>): DebuggerCommand {
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
 *
 * @param input
 */
function parseScopeQuery(input: Record<string, unknown>): ScopeQuery {
  const sessionId = expectString(input.sessionId, 'sessionId');
  const callFrameId = expectString(input.callFrameId, 'callFrameId');
  const scopeNumber = expectNumber(input.scopeNumber, 'scopeNumber');
  const path = input.path ? parseScopePath(input.path, 'path') : undefined;
  const depth =
    input.depth !== undefined ? expectNumber(input.depth, 'depth') : undefined;
  const maxProperties =
    input.maxProperties !== undefined
      ? expectNumber(input.maxProperties, 'maxProperties')
      : undefined;
  return { sessionId, callFrameId, scopeNumber, path, depth, maxProperties };
}

/**
 *
 * @param input
 */
function parseOutputQuery(input: Record<string, unknown>): OutputQuery {
  const sessionId = expectString(input.sessionId, 'sessionId');
  const since =
    input.since !== undefined ? expectNumber(input.since, 'since') : undefined;
  const limit =
    input.limit !== undefined ? expectNumber(input.limit, 'limit') : undefined;
  const streams = input.streams
    ? optionalStringArray(input.streams, 'streams')
    : undefined;
  if (streams) {
    for (const stream of streams) {
      if (stream !== 'stdout' && stream !== 'stderr') {
        throw new Error(
          `streams entries must be 'stdout' or 'stderr' (received ${stream}).`,
        );
      }
    }
  }
  const levels = input.levels
    ? optionalStringArray(input.levels, 'levels')
    : undefined;
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
  const search = optionalString(input.search, 'search');
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
 *
 * @param value
 */
function parseBreakpointMutation(
  value: unknown,
): BreakpointMutation | undefined {
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
 *
 * @param value
 * @param label
 */
function parseBreakpointArray(value: unknown, label: string): BreakpointSpec[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((entry, index) =>
    parseBreakpointSpec(
      expectRecord(entry, `${label}[${index}]`),
      `${label}[${index}]`,
    ),
  );
}

/**
 *
 * @param value
 * @param label
 */
function parseBreakpointSpec(
  value: Record<string, unknown>,
  label: string,
): BreakpointSpec {
  const locationRecord = expectRecord(value.location, `${label}.location`);
  const location = parseBreakpointLocation(locationRecord, `${label}.location`);
  const condition = optionalString(value.condition, `${label}.condition`);
  return { location, condition };
}

/**
 *
 * @param value
 * @param label
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
 *
 * @param value
 * @param label
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
    throw new Error(
      `${label}[${index}] must include either "index" or "property".`,
    );
  });
}

/**
 *
 * @param value
 * @param label
 */
function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

/**
 *
 * @param value
 * @param label
 */
function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

/**
 *
 * @param value
 * @param label
 */
function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

/**
 *
 * @param value
 * @param label
 */
function expectNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }
  return value;
}

/**
 *
 * @param value
 * @param label
 */
function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

/**
 *
 * @param value
 * @param label
 */
function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return expectBoolean(value, label);
}

/**
 *
 * @param value
 * @param label
 */
function optionalStringArray(
  value: unknown,
  label: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${label}[${index}] must be a string.`);
    }
    return entry;
  });
}

/**
 *
 * @param value
 * @param label
 */
function optionalStringRecord(
  value: unknown,
  label: string,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = expectRecord(value, label);
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(record)) {
    if (typeof val !== 'string') {
      throw new Error(`${label}.${key} must be a string.`);
    }
    result[key] = val;
  }
  return result;
}

export const command = new JsDebuggerCommand();

export default command;
