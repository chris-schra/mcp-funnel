import type {
  IMockSessionManager,
  MockDebugSession,
  DebugRequest,
  CallToolResult,
  ConsoleMessage,
} from '../types.js';

/**
 * Mock session manager - separates mock logic from real debug logic
 * Implements the IMockSessionManager interface for clean separation
 */
export class MockSessionManager implements IMockSessionManager {
  private mockSessions = new Map<string, MockDebugSession>();

  createMockSession(request: DebugRequest): string {
    const sessionId = crypto.randomUUID();
    const startTime = new Date().toISOString();

    const session: MockDebugSession = {
      request,
      currentBreakpointIndex: 0,
      events: [],
      startTime,
      consoleOutput: [],
    };

    // Add mock console output based on verbosity settings
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

      if (['all', 'warn-error', 'error-only'].includes(verbosity)) {
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

    this.mockSessions.set(sessionId, session);
    return sessionId;
  }

  getMockSession(sessionId: string): MockDebugSession | undefined {
    return this.mockSessions.get(sessionId);
  }

  deleteMockSession(sessionId: string): boolean {
    return this.mockSessions.delete(sessionId);
  }

  listMockSessions(): Array<{
    id: string;
    platform: string;
    target: string;
    state: { status: 'paused' };
    startTime: string;
    mock: true;
  }> {
    return Array.from(this.mockSessions.entries()).map(([id, session]) => ({
      id,
      platform: session.request.platform,
      target: session.request.target,
      state: { status: 'paused' as const },
      startTime: session.startTime,
      mock: true as const,
    }));
  }

  continueMockSession(
    sessionId: string,
    args: {
      action?: string;
      evaluate?: string;
    },
  ): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Mock session not found',
              sessionId,
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
              sessionId,
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
      this.mockSessions.delete(sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId,
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
      this.mockSessions.delete(sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sessionId,
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
              sessionId,
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

  /**
   * Create initial mock debug session response
   */
  createInitialMockResponse(
    sessionId: string,
    request: DebugRequest,
  ): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Mock session creation failed',
              sessionId,
            }),
          },
        ],
        isError: true,
      };
    }

    if (!request.breakpoints || request.breakpoints.length === 0) {
      this.mockSessions.delete(sessionId);
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

  /**
   * Handle mock session stop
   */
  stopMockSession(sessionId: string): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Mock session not found',
              sessionId,
            }),
          },
        ],
        isError: true,
      };
    }

    this.mockSessions.delete(sessionId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            sessionId,
            status: 'terminated',
            message: '[MOCK] Debug session stopped and cleaned up successfully',
          }),
        },
      ],
    };
  }

  /**
   * Get mock stack trace
   */
  getStackTraceMock(sessionId: string): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Mock session not found',
              sessionId,
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
              sessionId,
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

  /**
   * Get mock console output with filtering
   */
  getConsoleOutputMock(
    sessionId: string,
    args: {
      levels?: Record<string, boolean>;
      search?: string;
      since?: number;
    },
  ): CallToolResult {
    const session = this.mockSessions.get(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Mock session not found',
              sessionId,
            }),
          },
        ],
        isError: true,
      };
    }

    const output =
      args.since !== undefined
        ? session.consoleOutput.slice(args.since)
        : session.consoleOutput;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId,
              consoleOutput: this.formatConsoleOutput(output),
              totalCount: session.consoleOutput.length,
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

  /**
   * Get mock variables with sophisticated inspection
   */
  getVariablesMock(args: {
    sessionId: string;
    path?: string;
    frameId?: number;
    maxDepth?: number;
  }): CallToolResult {
    const session = this.mockSessions.get(args.sessionId);
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

    const mockVariables = this.createMockVariables(session);

    if (args.path) {
      return this.handleMockPathAccess(
        args.sessionId,
        args.path,
        frameId,
        mockVariables,
      );
    } else {
      return this.handleMockScopeAccess(
        args.sessionId,
        frameId,
        maxDepth,
        mockVariables,
      );
    }
  }

  /**
   * Create comprehensive mock variables for testing
   */
  private createMockVariables(session: MockDebugSession) {
    return {
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
  }

  private handleMockPathAccess(
    sessionId: string,
    path: string,
    frameId: number,
    mockVariables: any,
  ): CallToolResult {
    const pathParts = path.split('.');
    let current: any = mockVariables;
    let found = true;

    try {
      for (const part of pathParts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
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
          : `Variable path '${path}' not found in mock session`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sessionId,
                frameId,
                path,
                result,
                message: `[MOCK] Variable inspection for path: ${path}`,
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
              sessionId,
              frameId,
              path,
              result: {
                found: false,
                error: `[MOCK] Error accessing path '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            }),
          },
        ],
        isError: true,
      };
    }
  }

  private handleMockScopeAccess(
    sessionId: string,
    frameId: number,
    maxDepth: number,
    mockVariables: any,
  ): CallToolResult {
    const scopes = [
      {
        type: 'local',
        name: 'Local',
        variables: Object.entries(mockVariables.local).map(([name, value]) => ({
          name,
          value,
          type: Array.isArray(value) ? 'array' : typeof value,
          configurable: true,
          enumerable: true,
        })),
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
              sessionId,
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

  private formatConsoleOutput(messages: ConsoleMessage[]) {
    return messages.slice(-10).map((msg) => ({
      level: msg.level,
      timestamp: msg.timestamp,
      message: msg.message,
      args: msg.args,
    }));
  }
}
