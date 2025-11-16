import type { Tool } from '@mcp-funnel/commands-core';

const STRING = 'string';
const NUMBER = 'number';
const BOOLEAN = 'boolean';

/**
 * Creates a breakpoint location schema
 * @returns Breakpoint location schema
 */
export function createBreakpointLocationSchema(): Tool['inputSchema'] {
  return {
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
  };
}

/**
 * Creates a breakpoint spec schema
 * @param locationSchema - Breakpoint location schema to include
 * @returns Breakpoint spec schema
 */
export function createBreakpointSpecSchema(
  locationSchema: Tool['inputSchema'],
): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: {
      location: locationSchema,
      condition: {
        type: STRING,
        description: 'Optional JavaScript expression evaluated before pausing.',
      },
    },
    required: ['location'],
  };
}

/**
 * Creates a breakpoint mutation schema
 * @param breakpointSpecSchema - Breakpoint spec schema for set operations
 * @returns Breakpoint mutation schema
 */
export function createBreakpointMutationSchema(
  breakpointSpecSchema: Tool['inputSchema'],
): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: {
      set: {
        type: 'array',
        description: 'Breakpoints to set before executing the command.',
        items: breakpointSpecSchema,
      },
      remove: {
        type: 'array',
        description: 'Breakpoint identifiers to remove before executing the command.',
        items: { type: STRING },
      },
    },
  };
}

/**
 * Creates a start debug session schema
 * @param breakpointSpecSchema - Breakpoint spec schema for initial breakpoints
 * @returns Start debug session schema
 */
export function createStartSessionSchema(
  breakpointSpecSchema: Tool['inputSchema'],
): Tool['inputSchema'] {
  return {
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
            description: 'Environment variables merged onto the current process environment.',
          },
          useTsx: {
            type: BOOLEAN,
            description: 'Inject `--import tsx/register` for TypeScript debugging.',
          },
          runtimeArguments: {
            type: 'array',
            items: { type: STRING },
            description: 'Additional Node.js runtime flags (e.g., --trace-warnings).',
          },
          nodePath: {
            type: STRING,
            description: 'Path to the Node.js executable.',
          },
          inspectHost: {
            type: STRING,
            description: 'Host interface for the inspector (defaults to 127.0.0.1).',
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
        description: 'If true, resume execution after setup. Defaults to staying paused.',
      },
    },
    required: ['target'],
  };
}

/**
 * Creates a debugger command schema
 * @param breakpointLocationSchema - Breakpoint location schema for continueToLocation
 * @param breakpointMutationSchema - Breakpoint mutation schema for breakpoint operations
 * @returns Debugger command schema
 */
export function createDebuggerCommandSchema(
  breakpointLocationSchema: Tool['inputSchema'],
  breakpointMutationSchema: Tool['inputSchema'],
): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: {
      sessionId: { type: STRING, description: 'Debugger session identifier.' },
      action: {
        type: STRING,
        enum: ['continue', 'pause', 'stepInto', 'stepOver', 'stepOut', 'continueToLocation'],
        description: 'Execution control command to perform.',
      },
      location: {
        ...breakpointLocationSchema,
        description:
          'Required when action is "continueToLocation". Breakpoint location to continue to.',
      },
      breakpoints: breakpointMutationSchema,
    },
    required: ['sessionId', 'action'],
  };
}

/**
 * Creates a scope query schema
 * @returns Scope query schema
 */
export function createScopeQuerySchema(): Tool['inputSchema'] {
  const scopePathSegmentSchema = {
    oneOf: [
      { type: STRING },
      {
        type: 'object',
        properties: {
          index: { type: NUMBER },
          property: { type: STRING },
        },
        additionalProperties: false,
      },
    ],
  };

  return {
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
        description: 'Optional path navigating into nested properties before enumeration.',
        items: scopePathSegmentSchema,
      },
      depth: {
        type: NUMBER,
        description: 'Traversal depth starting from the resolved object (default 1).',
      },
      maxProperties: {
        type: NUMBER,
        description: 'Maximum number of properties per depth level (default 25).',
      },
    },
    required: ['sessionId', 'callFrameId', 'scopeNumber'],
  };
}

/**
 * Creates an output query schema
 * @returns Output query schema
 */
export function createOutputQuerySchema(): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: {
      sessionId: { type: STRING, description: 'Debugger session identifier.' },
      since: {
        type: NUMBER,
        description: 'Return entries with cursor strictly greater than this value.',
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
        items: {
          type: STRING,
          enum: ['log', 'error', 'warn', 'info', 'debug'],
        },
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
  };
}
