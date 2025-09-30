import { Tool } from '@mcp-funnel/commands-core';

/**
 * MCP tool definitions for the js-debugger command
 * Extracted to keep command.ts under 300 lines
 */
export const JS_DEBUGGER_TOOLS: Tool[] = [
  {
    name: 'debug',
    description: 'Start a debug session and pause at first breakpoint',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['node', 'browser'],
          description: 'Debugging platform (node or browser)',
        },
        target: {
          type: 'string',
          description:
            'Script path for Node or URL/connection mode for browser',
        },
        command: {
          type: 'string',
          description:
            'Runtime command for Node (e.g., "node", "tsx", "ts-node"). Defaults to "node"',
          default: 'node',
        },
        breakpoints: {
          type: 'array',
          description: 'Breakpoints to set',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string', description: 'File path' },
              line: {
                type: 'number',
                description: 'Line number (1-based)',
              },
              condition: {
                type: 'string',
                description: 'Optional condition',
              },
            },
            required: ['file', 'line'],
          },
        },
        timeout: { type: 'number', default: 30000 },
        evalExpressions: { type: 'array', items: { type: 'string' } },
        captureConsole: {
          type: 'boolean',
          description: 'Capture console output during debug session',
          default: true,
        },
        consoleVerbosity: {
          type: 'string',
          enum: ['all', 'warn-error', 'error-only', 'none'],
          description: 'Console output verbosity level',
          default: 'all',
        },
        stopOnEntry: { type: 'boolean', default: false },
        useMock: {
          type: 'boolean',
          description: 'Use mock implementation instead of real CDP',
          default: false,
        },
      },
      required: ['platform', 'target'],
    },
  },
  {
    name: 'continue',
    description: 'Continue debug session to next breakpoint',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Debug session ID' },
        action: {
          type: 'string',
          enum: ['continue', 'step_over', 'step_into', 'step_out', 'stop'],
          default: 'continue',
        },
        evaluate: { type: 'string', description: 'Expression to evaluate' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'list_sessions',
    description: 'List active debug sessions',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'stop',
    description: 'Stop and terminate a debug session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Debug session ID' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_stacktrace',
    description: 'Get current stack trace when session is paused',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Debug session ID' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_variables',
    description:
      'Get variables from current debug context with sophisticated inspection',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Debug session ID' },
        path: {
          type: 'string',
          description:
            'Dot-notation path to specific variable (e.g., "user.profile.settings")',
        },
        frameId: {
          type: 'number',
          description:
            'Specific stack frame to inspect (defaults to top frame)',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse objects (defaults to 3)',
          default: 3,
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'search_console_output',
    description: 'Search and filter console output from a debug session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Debug session ID' },
        levels: {
          type: 'object',
          description:
            'Log levels to include (defaults to warn and error only)',
          properties: {
            log: { type: 'boolean' },
            debug: { type: 'boolean' },
            info: { type: 'boolean' },
            warn: { type: 'boolean' },
            error: { type: 'boolean' },
            trace: { type: 'boolean' },
          },
          default: { warn: true, error: true },
        },
        search: {
          type: 'string',
          description: 'Optional search string to filter messages',
        },
        since: {
          type: 'number',
          description: 'Return output since this index (0-based)',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'cleanup_sessions',
    description:
      'Manually trigger cleanup of inactive sessions and get cleanup status',
    inputSchema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description:
            'Force cleanup of all inactive sessions regardless of thresholds',
          default: false,
        },
        dryRun: {
          type: 'boolean',
          description:
            'Show what would be cleaned up without actually cleaning',
          default: false,
        },
      },
    },
  },
];
