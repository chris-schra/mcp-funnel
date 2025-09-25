import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';
import chalk from 'chalk';
import { SessionManager } from './session-manager.js';
import type {
  DebugRequest as TypedDebugRequest,
  DebugSession,
  DebugState,
  ConsoleMessage,
  Scope,
  Variable,
} from './types.js';

// Feature flag - set to true to use real CDP implementation
const USE_REAL_CDP = process.env.JS_DEBUGGER_REAL !== 'false';

interface DebugRequest extends TypedDebugRequest {
  useMock?: boolean; // Allow override per request
}

export class JsDebuggerCommand implements ICommand {
  readonly name = 'js-debugger';
  readonly description = 'Debug JavaScript in Node.js or browser environments';
  private sessionManager = SessionManager.getInstance();

  getMCPDefinitions(): Tool[] {
    return [
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
            evalExpressions: {
              type: 'array',
              items: { type: 'string' },
            },
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
    ];
  }

  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    switch (toolName) {
      case 'debug':
        return this.startDebugSession(args as unknown as DebugRequest);
      case 'continue':
        return this.continueDebugSession(
          args as unknown as {
            sessionId: string;
            action?: string;
            evaluate?: string;
          },
        );
      case 'list_sessions':
        return this.listSessions();
      case 'search_console_output':
        return this.searchConsoleOutput(
          args as unknown as {
            sessionId: string;
            levels?: Record<string, boolean>;
            search?: string;
            since?: number;
          },
        );
      case 'stop':
        return this.stopSession(args as unknown as { sessionId: string });
      case 'get_stacktrace':
        return this.getStackTrace(args as unknown as { sessionId: string });
      case 'get_variables':
        return this.getVariables(
          args as unknown as {
            sessionId: string;
            path?: string;
            frameId?: number;
            maxDepth?: number;
          },
        );
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
  }

  private async startDebugSession(
    request: DebugRequest,
  ): Promise<CallToolResult> {
    try {
      // Use mock if explicitly requested or if real CDP is disabled
      const shouldUseMock = request.useMock || !USE_REAL_CDP;

      if (shouldUseMock) {
        return this.startMockDebugSession(request);
      }

      // Create real debug session
      const sessionId = await this.sessionManager.createSession(request);
      const session = this.sessionManager.getSession(sessionId);

      if (!session) {
        throw new Error('Failed to create debug session');
      }

      // For running sessions (not paused), return session info immediately
      // Users can call get_console_output to fetch console output
      if (session.state.status === 'running') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionId,
                  status: 'running',
                  message: `Debug session started. Use js-debugger_search_console_output with sessionId "${sessionId}" to search console output.`,
                  platform: request.platform,
                  target: request.target,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // For paused sessions, return full debug info
      return this.formatDebugResponse(session);
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
              details: error instanceof Error ? error.stack : undefined,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  private async continueDebugSession(args: {
    sessionId: string;
    action?: string;
    evaluate?: string;
  }): Promise<CallToolResult> {
    try {
      const session = this.sessionManager.getSession(args.sessionId);

      if (!session) {
        // Check if it's a mock session
        const mockSession = this.getMockSession(args.sessionId);
        if (mockSession) {
          return this.continueMockSession(args);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Session not found',
                sessionId: args.sessionId,
                activeSessions: this.sessionManager
                  .listSessions()
                  .map((s) => s.id),
              }),
            },
          ],
          isError: true,
        };
      }

      // Handle evaluate request
      if (args.evaluate) {
        const result = await session.adapter.evaluate(args.evaluate);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sessionId: args.sessionId,
                evaluation: result,
                status: 'paused',
                message: 'Evaluation complete. Session still paused.',
              }),
            },
          ],
        };
      }

      // Handle stop action
      if (args.action === 'stop') {
        await session.adapter.disconnect();
        this.sessionManager.deleteSession(args.sessionId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sessionId: args.sessionId,
                status: 'terminated',
                message: 'Debug session terminated by user',
              }),
            },
          ],
        };
      }

      // Handle step actions
      let newState: DebugState;
      switch (args.action) {
        case 'step_over':
          newState = await session.adapter.stepOver();
          break;
        case 'step_into':
          newState = await session.adapter.stepInto();
          break;
        case 'step_out':
          newState = await session.adapter.stepOut();
          break;
        case 'continue':
        default:
          newState = await session.adapter.continue();
          break;
      }

      session.state = newState;
      return this.formatDebugResponse(session);
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
              sessionId: args.sessionId,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  private listSessions(): CallToolResult {
    const realSessions = this.sessionManager.listSessions();
    const mockSessions = Array.from(mockSessionsMap.entries()).map(
      ([id, session]) => ({
        id,
        platform: session.request.platform,
        target: session.request.target,
        state: { status: 'paused' as const },
        startTime: session.startTime,
        mock: true,
      }),
    );

    const allSessions = [...realSessions, ...mockSessions];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ sessions: allSessions }, null, 2),
        },
      ],
    };
  }

  private searchConsoleOutput(args: {
    sessionId: string;
    levels?: Record<string, boolean>;
    search?: string;
    since?: number;
  }): CallToolResult {
    const session = this.sessionManager.getSession(args.sessionId);

    if (!session) {
      // Check if it's a mock session
      const mockSession = this.getMockSession(args.sessionId);
      if (mockSession) {
        const output =
          args.since !== undefined
            ? mockSession.consoleOutput.slice(args.since)
            : mockSession.consoleOutput;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionId: args.sessionId,
                  consoleOutput: this.formatConsoleOutput(output),
                  totalCount: mockSession.consoleOutput.length,
                  returnedCount: output.length,
                  status: 'mock',
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Session not found',
              sessionId: args.sessionId,
            }),
          },
        ],
        isError: true,
      };
    }

    // Default levels: warn and error only
    const levels = args.levels || { warn: true, error: true };

    // Get console output from the session
    let output =
      args.since !== undefined
        ? session.consoleOutput.slice(args.since)
        : session.consoleOutput;

    // Filter by levels
    output = output.filter((msg) => levels[msg.level] === true);

    // Filter by search string if provided
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      output = output.filter(
        (msg) =>
          msg.message.toLowerCase().includes(searchLower) ||
          msg.args.some((arg) =>
            String(arg).toLowerCase().includes(searchLower),
          ),
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId: args.sessionId,
              consoleOutput: this.formatConsoleOutput(output),
              filters: {
                levels,
                search: args.search,
              },
              totalCount: session.consoleOutput.length,
              filteredCount: output.length,
              status: session.state.status,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private async formatDebugResponse(
    session: DebugSession,
  ): Promise<CallToolResult> {
    const { state, consoleOutput, id: sessionId } = session;

    if (state.status === 'terminated') {
      this.sessionManager.deleteSession(sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId,
              status: 'completed',
              message: 'Debug session completed',
            }),
          },
        ],
      };
    }

    if (state.status === 'paused') {
      const stackTrace = await session.adapter.getStackTrace();
      const topFrame = stackTrace[0];
      const scopes = topFrame
        ? await session.adapter.getScopes(topFrame.id)
        : [];

      const variables: Record<string, unknown> = {};
      for (const scope of scopes) {
        variables[scope.type] = Object.fromEntries(
          scope.variables.map((v) => [v.name, v.value]),
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sessionId,
                status: 'paused',
                pauseReason: state.pauseReason,
                breakpoint: state.breakpoint,
                exception: state.exception,
                stackTrace: stackTrace.map((frame) => ({
                  functionName: frame.functionName,
                  file: frame.file,
                  line: frame.line,
                  column: frame.column,
                })),
                variables,
                consoleOutput: this.formatConsoleOutput(consoleOutput),
                message: `Paused${state.pauseReason ? ` at ${state.pauseReason}` : ''}. Use js-debugger_continue tool to proceed.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            sessionId,
            status: state.status,
            message: 'Debug session is running',
          }),
        },
      ],
    };
  }

  private async stopSession(args: {
    sessionId: string;
  }): Promise<CallToolResult> {
    try {
      const session = this.sessionManager.getSession(args.sessionId);

      if (!session) {
        // Check if it's a mock session
        const mockSession = this.getMockSession(args.sessionId);
        if (mockSession) {
          return this.stopMockSession(args.sessionId);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Session not found',
                sessionId: args.sessionId,
                activeSessions: this.sessionManager
                  .listSessions()
                  .map((s) => s.id),
              }),
            },
          ],
          isError: true,
        };
      }

      // Clean disconnect and termination
      await session.adapter.disconnect();
      this.sessionManager.deleteSession(args.sessionId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId: args.sessionId,
              status: 'terminated',
              message: 'Debug session stopped and cleaned up successfully',
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
              sessionId: args.sessionId,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  private async getStackTrace(args: {
    sessionId: string;
  }): Promise<CallToolResult> {
    try {
      const session = this.sessionManager.getSession(args.sessionId);

      if (!session) {
        // Check if it's a mock session
        const mockSession = this.getMockSession(args.sessionId);
        if (mockSession) {
          return this.getStackTraceMock(args.sessionId);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Session not found',
                sessionId: args.sessionId,
              }),
            },
          ],
          isError: true,
        };
      }

      if (session.state.status !== 'paused') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'Session is not paused. Stack trace is only available when execution is paused.',
                sessionId: args.sessionId,
                currentStatus: session.state.status,
              }),
            },
          ],
          isError: true,
        };
      }

      const stackTrace = await session.adapter.getStackTrace();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sessionId: args.sessionId,
                status: 'paused',
                stackTrace: stackTrace.map((frame) => ({
                  frameId: frame.id,
                  functionName: frame.functionName,
                  file: frame.file,
                  line: frame.line,
                  column: frame.column,
                })),
                frameCount: stackTrace.length,
                message: `Stack trace with ${stackTrace.length} frames`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
              sessionId: args.sessionId,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  private async getVariables(args: {
    sessionId: string;
    path?: string;
    frameId?: number;
    maxDepth?: number;
  }): Promise<CallToolResult> {
    try {
      const session = this.sessionManager.getSession(args.sessionId);

      if (!session) {
        // Check if it's a mock session
        const mockSession = this.getMockSession(args.sessionId);
        if (mockSession) {
          return this.getVariablesMock(args);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Session not found',
                sessionId: args.sessionId,
              }),
            },
          ],
          isError: true,
        };
      }

      if (session.state.status !== 'paused') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'Session is not paused. Variable inspection is only available when execution is paused.',
                sessionId: args.sessionId,
                currentStatus: session.state.status,
              }),
            },
          ],
          isError: true,
        };
      }

      const frameId = args.frameId ?? 0;
      const maxDepth = args.maxDepth ?? 3;

      // Get the scopes for the specified frame
      const scopes = await session.adapter.getScopes(frameId);

      if (args.path) {
        // Path-based variable access
        const result = await this.getVariableByPath(
          session,
          scopes,
          args.path,
          maxDepth,
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionId: args.sessionId,
                  frameId,
                  path: args.path,
                  result,
                  message: `Variable inspection for path: ${args.path}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } else {
        // Get all variables in all scopes
        const enrichedScopes = await Promise.all(
          scopes.map(async (scope) => ({
            type: scope.type,
            name: scope.name,
            variables: await Promise.all(
              scope.variables.map(async (variable) => ({
                name: variable.name,
                value: await this.enrichVariableValue(
                  session,
                  variable.value,
                  variable.type,
                  maxDepth,
                  new Set(),
                ),
                type: variable.type,
                configurable: variable.configurable,
                enumerable: variable.enumerable,
              })),
            ),
          })),
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionId: args.sessionId,
                  frameId,
                  maxDepth,
                  scopes: enrichedScopes,
                  message: `Variable inspection for frame ${frameId} with max depth ${maxDepth}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
              sessionId: args.sessionId,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  private async getVariableByPath(
    session: DebugSession,
    scopes: Scope[],
    path: string,
    maxDepth: number,
  ): Promise<{
    found: boolean;
    value?: unknown;
    type?: string;
    error?: string;
  }> {
    const pathParts = path.split('.');
    const rootVariableName = pathParts[0];

    // Find the root variable in any scope
    let rootVariable: Variable | undefined;
    let _scopeName: string | undefined; // TODO: Will be used for enhanced debugging context in future iterations

    for (const scope of scopes) {
      rootVariable = scope.variables.find(
        (v: Variable) => v.name === rootVariableName,
      );
      if (rootVariable) {
        _scopeName = scope.name || scope.type;
        break;
      }
    }

    if (!rootVariable) {
      return {
        found: false,
        error: `Variable '${rootVariableName}' not found in any scope`,
      };
    }

    // If it's just the root variable, return it enriched
    if (pathParts.length === 1) {
      const enrichedValue = await this.enrichVariableValue(
        session,
        rootVariable.value,
        rootVariable.type,
        maxDepth,
        new Set(),
      );
      return {
        found: true,
        value: enrichedValue,
        type: rootVariable.type,
      };
    }

    // Navigate through the path
    try {
      const result = await this.navigateVariablePath(
        session,
        rootVariable.value,
        rootVariable.type,
        pathParts.slice(1),
        maxDepth,
        new Set(),
      );
      return {
        found: true,
        value: result.value,
        type: result.type,
      };
    } catch (error) {
      return {
        found: false,
        error: `Error navigating path '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async navigateVariablePath(
    _session: DebugSession, // TODO: Will be used for CDP-based deep navigation in future iterations
    currentValue: unknown,
    currentType: string,
    remainingPath: string[],
    _maxDepth: number, // TODO: Will be used for depth-limited navigation in future iterations
    _visitedObjects: Set<string>, // TODO: Will be used for circular reference detection in future iterations
  ): Promise<{ value: unknown; type: string }> {
    if (remainingPath.length === 0) {
      return { value: currentValue, type: currentType };
    }

    if (currentType !== 'object' || currentValue === null) {
      throw new Error(
        `Cannot navigate property '${remainingPath[0]}' on non-object type '${currentType}'`,
      );
    }

    // This would need to be implemented based on adapter capabilities
    // For now, return a placeholder implementation
    throw new Error(
      'Deep object navigation not fully implemented in current CDP client',
    );
  }

  private async enrichVariableValue(
    session: DebugSession,
    value: unknown,
    type: string,
    maxDepth: number,
    visitedObjects: Set<string>,
    currentDepth = 0,
  ): Promise<unknown> {
    // Prevent infinite recursion
    if (currentDepth >= maxDepth) {
      return `[Max depth ${maxDepth} reached]`;
    }

    // Handle primitive types
    if (type !== 'object' || value === null || value === undefined) {
      return this.formatPrimitiveValue(value, type);
    }

    // Handle circular references
    const valueId = this.getObjectId(value);
    if (valueId && visitedObjects.has(valueId)) {
      return '[Circular]';
    }

    if (valueId) {
      visitedObjects.add(valueId);
    }

    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length > 100) {
        return `[Array with ${value.length} items - too large to display]`;
      }

      const enrichedArray = await Promise.all(
        value.slice(0, 50).map(async (item, index) => ({
          index: String(index),
          value: await this.enrichVariableValue(
            session,
            item,
            typeof item,
            maxDepth,
            new Set(visitedObjects),
            currentDepth + 1,
          ),
        })),
      );

      if (value.length > 50) {
        enrichedArray.push({
          index: '...',
          value: `[${value.length - 50} more items]`,
        });
      }

      return enrichedArray;
    }

    // Handle special object types
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }

    if (value instanceof RegExp) {
      return { __type: 'RegExp', value: value.toString() };
    }

    if (value instanceof Map) {
      return {
        __type: 'Map',
        size: value.size,
        entries: Array.from(value.entries()).slice(0, 20),
      };
    }

    if (value instanceof Set) {
      return {
        __type: 'Set',
        size: value.size,
        values: Array.from(value.values()).slice(0, 20),
      };
    }

    if (value instanceof WeakMap) {
      return { __type: 'WeakMap', note: 'WeakMap contents not accessible' };
    }

    if (value instanceof WeakSet) {
      return { __type: 'WeakSet', note: 'WeakSet contents not accessible' };
    }

    if (value instanceof Promise) {
      return { __type: 'Promise', state: 'pending' };
    }

    // Handle plain objects
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      const result: Record<string, unknown> = {};

      // Limit object property inspection to avoid performance issues
      const maxProps = 50;
      const keysToProcess = keys.slice(0, maxProps);

      for (const key of keysToProcess) {
        try {
          const propValue = (value as Record<string, unknown>)[key];
          result[key] = await this.enrichVariableValue(
            session,
            propValue,
            typeof propValue,
            maxDepth,
            new Set(visitedObjects),
            currentDepth + 1,
          );
        } catch (error) {
          result[key] =
            `[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
        }
      }

      if (keys.length > maxProps) {
        result['...'] = `[${keys.length - maxProps} more properties]`;
      }

      return result;
    }

    return value;
  }

  private formatPrimitiveValue(value: unknown, type: string): unknown {
    switch (type) {
      case 'string':
        return value;
      case 'number':
        return value;
      case 'boolean':
        return value;
      case 'undefined':
        return undefined;
      case 'symbol':
        return `[Symbol: ${String(value)}]`;
      case 'function':
        return `[Function: ${String(value)}]`;
      case 'bigint':
        return `${String(value)}n`;
      default:
        return value;
    }
  }

  private getObjectId(value: unknown): string | null {
    // In a real implementation, this would use the objectId from CDP
    // For now, we use a simple fallback
    try {
      return String(value);
    } catch {
      return null;
    }
  }

  private formatConsoleOutput(messages: ConsoleMessage[]) {
    return messages.slice(-10).map((msg) => ({
      level: msg.level,
      timestamp: msg.timestamp,
      message: msg.message,
      args: msg.args,
    }));
  }

  // Mock implementation methods (preserved for backward compatibility)
  private mockSessions = new Map<string, MockDebugSession>();

  private async startMockDebugSession(
    request: DebugRequest,
  ): Promise<CallToolResult> {
    const sessionId = crypto.randomUUID();
    const startTime = new Date().toISOString();

    const session: MockDebugSession = {
      request,
      currentBreakpointIndex: 0,
      events: [],
      startTime,
      consoleOutput: [],
    };
    mockSessionsMap.set(sessionId, session);

    // Add mock console output
    if (request.captureConsole !== false) {
      const verbosity = request.consoleVerbosity || 'all';

      if (verbosity === 'all') {
        session.consoleOutput.push({
          level: 'log',
          timestamp: new Date().toISOString(),
          message: 'Starting application...',
          args: ['Starting application...'],
        });
      }

      if (
        verbosity === 'all' ||
        verbosity === 'warn-error' ||
        verbosity === 'error-only'
      ) {
        session.consoleOutput.push({
          level: 'error',
          timestamp: new Date().toISOString(),
          message:
            'Error: Potential memory leak detected! EventEmitter has 11 listeners attached',
          args: [
            'Error: Potential memory leak detected! EventEmitter has 11 listeners attached',
          ],
        });
      }
    }

    if (!request.breakpoints || request.breakpoints.length === 0) {
      mockSessionsMap.delete(sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId,
              status: 'completed',
              message: 'Debug session completed with no breakpoints (mock)',
            }),
          },
        ],
      };
    }

    const bp = request.breakpoints[0];
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId,
              status: 'paused',
              mock: true,
              breakpoint: {
                file: bp.file,
                line: bp.line,
                index: 0,
                total: request.breakpoints.length,
              },
              stackTrace: [
                { functionName: 'processData', file: bp.file, line: bp.line },
                {
                  functionName: 'main',
                  file: bp.file,
                  line: Math.max(1, bp.line - 10),
                },
              ],
              variables: {
                local: { index: 42, data: { type: 'mock', value: 'example' } },
                closure: { config: { debug: true } },
              },
              consoleOutput: session.consoleOutput,
              message: `[MOCK] Paused at breakpoint 1 of ${request.breakpoints.length}. Use js-debugger_continue tool with sessionId "${sessionId}" to proceed.`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private getMockSession(sessionId: string): MockDebugSession | undefined {
    return mockSessionsMap.get(sessionId);
  }

  private async continueMockSession(args: {
    sessionId: string;
    action?: string;
    evaluate?: string;
  }): Promise<CallToolResult> {
    const session = mockSessionsMap.get(args.sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Mock session not found',
              sessionId: args.sessionId,
            }),
          },
        ],
        isError: true,
      };
    }

    if (args.evaluate) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId: args.sessionId,
              evaluation: {
                expression: args.evaluate,
                result: `[Mock evaluated: ${args.evaluate}]`,
                type: 'string',
              },
              status: 'paused',
              message: '[MOCK] Evaluation complete. Session still paused.',
            }),
          },
        ],
      };
    }

    if (args.action === 'stop') {
      mockSessionsMap.delete(args.sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId: args.sessionId,
              status: 'terminated',
              message: '[MOCK] Debug session terminated by user',
            }),
          },
        ],
      };
    }

    session.currentBreakpointIndex++;

    if (
      session.currentBreakpointIndex >=
      (session.request.breakpoints?.length || 0)
    ) {
      mockSessionsMap.delete(args.sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId: args.sessionId,
              status: 'completed',
              message:
                '[MOCK] Debug session completed. All breakpoints visited.',
            }),
          },
        ],
      };
    }

    const bp = session.request.breakpoints![session.currentBreakpointIndex];
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId: args.sessionId,
              status: 'paused',
              mock: true,
              action: args.action || 'continue',
              breakpoint: {
                file: bp.file,
                line: bp.line,
                index: session.currentBreakpointIndex,
                total: session.request.breakpoints!.length,
              },
              stackTrace: [
                { functionName: 'processNext', file: bp.file, line: bp.line },
                {
                  functionName: 'main',
                  file: bp.file,
                  line: Math.max(1, bp.line - 10),
                },
              ],
              variables: {
                local: {
                  index: 42 + session.currentBreakpointIndex * 10,
                  iteration: session.currentBreakpointIndex,
                },
              },
              consoleOutput: session.consoleOutput.slice(-5),
              message: `[MOCK] Paused at breakpoint ${session.currentBreakpointIndex + 1} of ${session.request.breakpoints!.length}. Use js-debugger_continue tool to proceed.`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private stopMockSession(sessionId: string): CallToolResult {
    const session = mockSessionsMap.get(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Mock session not found',
              sessionId: sessionId,
            }),
          },
        ],
        isError: true,
      };
    }

    mockSessionsMap.delete(sessionId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            sessionId: sessionId,
            status: 'terminated',
            message: '[MOCK] Debug session stopped and cleaned up successfully',
          }),
        },
      ],
    };
  }

  private getStackTraceMock(sessionId: string): CallToolResult {
    const session = mockSessionsMap.get(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Mock session not found',
              sessionId: sessionId,
            }),
          },
        ],
        isError: true,
      };
    }

    const mockStackTrace = [
      {
        frameId: 0,
        functionName: 'processUserData',
        file: session.request.breakpoints?.[0]?.file || 'main.js',
        line: session.request.breakpoints?.[0]?.line || 15,
        column: 12,
      },
      {
        frameId: 1,
        functionName: 'handleRequest',
        file: session.request.breakpoints?.[0]?.file || 'main.js',
        line: (session.request.breakpoints?.[0]?.line || 15) - 8,
        column: 4,
      },
      {
        frameId: 2,
        functionName: 'main',
        file: session.request.breakpoints?.[0]?.file || 'main.js',
        line: 1,
        column: 1,
      },
    ];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId: sessionId,
              status: 'paused',
              stackTrace: mockStackTrace,
              frameCount: mockStackTrace.length,
              message: `[MOCK] Stack trace with ${mockStackTrace.length} frames`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private getVariablesMock(args: {
    sessionId: string;
    path?: string;
    frameId?: number;
    maxDepth?: number;
  }): CallToolResult {
    const session = mockSessionsMap.get(args.sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Mock session not found',
              sessionId: args.sessionId,
            }),
          },
        ],
        isError: true,
      };
    }

    const frameId = args.frameId ?? 0;
    const maxDepth = args.maxDepth ?? 3;

    const mockVariables = {
      local: {
        userId: 12345,
        userData: {
          name: 'John Doe',
          email: 'john@example.com',
          profile: {
            settings: {
              theme: 'dark',
              notifications: true,
              privacy: {
                public: false,
                trackingEnabled: false,
              },
            },
            preferences: ['email', 'sms'],
          },
        },
        processedCount: session.currentBreakpointIndex * 10 + 42,
        isProcessing: true,
        config: {
          debug: true,
          timeout: 5000,
          retryCount: 3,
        },
        largeArray: Array.from({ length: 150 }, (_, i) => `item-${i}`),
        circularRef: '[Circular reference detected]',
        dateObj: { __type: 'Date', value: '2023-12-01T10:30:00.000Z' },
        regexObj: { __type: 'RegExp', value: '/test/gi' },
        mapObj: {
          __type: 'Map',
          size: 3,
          entries: [
            ['key1', 'value1'],
            ['key2', 'value2'],
            ['key3', 'value3'],
          ],
        },
        setObj: {
          __type: 'Set',
          size: 2,
          values: ['item1', 'item2'],
        },
        promiseObj: { __type: 'Promise', state: 'pending' },
      },
      closure: {
        outerVariable: 'from closure',
        counter: session.currentBreakpointIndex,
      },
      global: {
        process: '[Node.js process object]',
        console: '[Console object]',
        Buffer: '[Buffer constructor]',
      },
    };

    if (args.path) {
      // Mock path-based access
      const pathParts = args.path.split('.');
      let current: Record<string, unknown> = mockVariables;
      let found = true;

      try {
        for (const part of pathParts) {
          if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part] as Record<
              string,
              unknown
            >;
          } else {
            found = false;
            break;
          }
        }

        const result = {
          found,
          value: found ? current : undefined,
          type: found
            ? Array.isArray(current)
              ? 'array'
              : typeof current
            : undefined,
          error: found
            ? undefined
            : `Variable path '${args.path}' not found in mock session`,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionId: args.sessionId,
                  frameId,
                  path: args.path,
                  result,
                  message: `[MOCK] Variable inspection for path: ${args.path}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sessionId: args.sessionId,
                frameId,
                path: args.path,
                result: {
                  found: false,
                  error: `[MOCK] Error accessing path '${args.path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
              }),
            },
          ],
          isError: true,
        };
      }
    } else {
      // Return all scopes
      const scopes = [
        {
          type: 'local',
          name: 'Local',
          variables: Object.entries(mockVariables.local).map(
            ([name, value]) => ({
              name,
              value,
              type: Array.isArray(value) ? 'array' : typeof value,
              configurable: true,
              enumerable: true,
            }),
          ),
        },
        {
          type: 'closure',
          name: 'Closure',
          variables: Object.entries(mockVariables.closure).map(
            ([name, value]) => ({
              name,
              value,
              type: typeof value,
              configurable: true,
              enumerable: true,
            }),
          ),
        },
        {
          type: 'global',
          name: 'Global',
          variables: Object.entries(mockVariables.global).map(
            ([name, value]) => ({
              name,
              value,
              type: typeof value,
              configurable: false,
              enumerable: false,
            }),
          ),
        },
      ];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sessionId: args.sessionId,
                frameId,
                maxDepth,
                scopes,
                message: `[MOCK] Variable inspection for frame ${frameId} with max depth ${maxDepth}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }

  async executeViaCLI(_args: string[]): Promise<void> {
    console.info(chalk.blue.bold('\nJavaScript Debugger'));
    console.info(
      chalk.yellow('Interactive debugging for Node.js and browsers'),
    );
    console.info('\nFeatures:');
    console.info('  - Chrome DevTools Protocol (CDP) integration');
    console.info('  - Node.js inspector support');
    console.info('  - Browser debugging via remote debugging port');
    console.info('  - Breakpoints with conditions');
    console.info('  - Step debugging (over, into, out)');
    console.info('  - Expression evaluation');
    console.info('  - Console output capture');
    console.info('\nUse via MCP for interactive debugging');
    console.info(
      `\nMode: ${USE_REAL_CDP ? 'Real CDP' : 'Mock'} (set JS_DEBUGGER_REAL=true/false to switch)`,
    );
  }
}

// Mock session type and storage
interface MockDebugSession {
  request: DebugRequest;
  currentBreakpointIndex: number;
  events: Array<Record<string, unknown>>;
  startTime: string;
  consoleOutput: Array<{
    level: 'log' | 'debug' | 'info' | 'warn' | 'error';
    timestamp: string;
    message: string;
    args: unknown[];
  }>;
}

const mockSessionsMap = new Map<string, MockDebugSession>();

// Add crypto import for mock sessions
import crypto from 'crypto';
