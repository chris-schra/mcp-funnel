import path from 'path';
import type {
  IMockSessionManager,
  MockDebugSession,
  DebugRequest,
  CallToolResult,
  ConsoleMessage,
  BreakpointStatusSummary,
  DebugLocation,
} from '../types.js';

type MockVariableScopes = {
  local: Record<string, unknown>;
  closure: Record<string, unknown>;
};

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
    const location = this.buildMockLocation(bp.file, bp.line);
    const breakpoints = this.getMockBreakpointsSummary(session);
    const lineSuffix = location.line ? `:${location.line}` : '';
    const locationLabel = location.relativePath || location.file || bp.file;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId,
              status: 'paused',
              pauseReason: 'breakpoint',
              mock: true,
              action: args.action || 'continue',
              breakpoint: {
                id: `mock-breakpoint-${session.currentBreakpointIndex}`,
                file: location.file || bp.file,
                line: location.line ?? bp.line,
                index: session.currentBreakpointIndex,
                total: session.request.breakpoints!.length,
                condition: bp.condition,
                verified: true,
                resolvedLocations: location.file
                  ? [
                      {
                        file: location.file,
                        line: location.line ?? bp.line,
                      },
                    ]
                  : undefined,
              },
              stackTrace: [
                {
                  frameId: 0,
                  functionName: 'processNext',
                  file: location.file || bp.file,
                  relativePath: location.relativePath,
                  origin: 'user',
                  line: location.line ?? bp.line,
                  column: 0,
                },
                {
                  frameId: 1,
                  functionName: 'main',
                  file: location.file || bp.file,
                  relativePath: location.relativePath,
                  origin: 'user',
                  line: Math.max(1, (location.line ?? bp.line) - 10),
                  column: 0,
                },
              ],
              location,
              hint: 'Mock pause. Use js-debugger_continue to proceed to the next step.',
              variables: {
                local: {
                  index: 42 + session.currentBreakpointIndex * 10,
                  iteration: session.currentBreakpointIndex,
                },
              },
              consoleOutput: session.consoleOutput.slice(-5),
              breakpoints,
              message: `[MOCK] Paused at breakpoint in ${locationLabel}${lineSuffix}`,
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
    const location = this.buildMockLocation(bp.file, bp.line);
    const breakpoints = this.getMockBreakpointsSummary(session);
    const lineSuffix = location.line ? `:${location.line}` : '';
    const locationLabel = location.relativePath || location.file || bp.file;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId,
              status: 'paused',
              pauseReason: 'breakpoint',
              mock: true,
              breakpoint: {
                id: 'mock-breakpoint-0',
                file: location.file || bp.file,
                line: location.line ?? bp.line,
                index: 0,
                total: request.breakpoints.length,
                condition: bp.condition,
                verified: true,
                resolvedLocations: location.file
                  ? [
                      {
                        file: location.file,
                        line: location.line ?? bp.line,
                      },
                    ]
                  : undefined,
              },
              stackTrace: [
                {
                  frameId: 0,
                  functionName: 'processData',
                  file: location.file || bp.file,
                  relativePath: location.relativePath,
                  origin: 'user',
                  line: location.line ?? bp.line,
                  column: 0,
                },
                {
                  frameId: 1,
                  functionName: 'main',
                  file: location.file || bp.file,
                  relativePath: location.relativePath,
                  origin: 'user',
                  line: Math.max(1, (location.line ?? bp.line) - 10),
                  column: 0,
                },
              ],
              location,
              hint: 'Mock pause. Use js-debugger_continue to proceed to the next step.',
              breakpoints,
              variables: {
                local: { index: 42, data: { type: 'mock', value: 'example' } },
                closure: { config: { debug: true } },
              },
              consoleOutput: session.consoleOutput,
              message: `[MOCK] Paused at breakpoint in ${locationLabel}${lineSuffix}`,
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

    const firstBreakpoint = session.request.breakpoints?.[0];
    const location = this.buildMockLocation(
      firstBreakpoint?.file || 'main.js',
      firstBreakpoint?.line ?? 15,
    );

    const mockStackTrace = [
      {
        frameId: 0,
        functionName: 'processUserData',
        file: location.file || 'main.js',
        relativePath: location.relativePath,
        origin: 'user',
        line: location.line ?? 15,
        column: location.column ?? 12,
      },
      {
        frameId: 1,
        functionName: 'handleRequest',
        file: location.file || 'main.js',
        relativePath: location.relativePath,
        origin: 'user',
        line: (location.line ?? 15) - 8,
        column: 4,
      },
      {
        frameId: 2,
        functionName: 'main',
        file: location.file || 'main.js',
        relativePath: location.relativePath,
        origin: 'user',
        line: 1,
        column: 1,
      },
    ];

    const breakpoints = this.getMockBreakpointsSummary(session);
    const lineSuffix = location.line ? `:${location.line}` : '';
    const locationLabel =
      location.relativePath || location.file || 'mock-target.js';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId,
              status: 'paused',
              pauseReason: 'breakpoint',
              location,
              hint: 'Mock pause. Use js-debugger_continue to proceed to the next step.',
              breakpoint: firstBreakpoint
                ? {
                    id: 'mock-breakpoint-0',
                    file: location.file || firstBreakpoint.file,
                    line: location.line ?? firstBreakpoint.line,
                    condition: firstBreakpoint.condition,
                    verified: true,
                    resolvedLocations: location.file
                      ? [
                          {
                            file: location.file,
                            line: location.line ?? firstBreakpoint.line,
                          },
                        ]
                      : undefined,
                  }
                : undefined,
              stackTrace: mockStackTrace,
              frameCount: mockStackTrace.length,
              breakpoints,
              message: `[MOCK] Paused at breakpoint in ${locationLabel}${lineSuffix}`,
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
    path: string;
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

    const trimmedPath = typeof args.path === 'string' ? args.path.trim() : '';
    if (!trimmedPath) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error:
                'Variable path is required. Provide the dot-notation path using the "path" parameter.',
              sessionId: args.sessionId,
            }),
          },
        ],
        isError: true,
      };
    }

    const frameId = args.frameId ?? 0;

    const mockVariables = this.createMockVariables(session);

    return this.handleMockPathAccess(
      args.sessionId,
      trimmedPath,
      frameId,
      mockVariables,
    );
  }

  /**
   * Create comprehensive mock variables for testing
   */
  private createMockVariables(session: MockDebugSession): MockVariableScopes {
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
    };
  }

  private getMockBreakpointsSummary(
    session: MockDebugSession,
  ): BreakpointStatusSummary | undefined {
    const requested = session.request.breakpoints ?? [];
    if (requested.length === 0) {
      return undefined;
    }

    return {
      requested: requested.length,
      set: requested.length,
      pending: [],
    };
  }

  private buildMockLocation(file: string, line: number): DebugLocation {
    const absolute = path.isAbsolute(file)
      ? file
      : path.resolve(process.cwd(), file);
    const relative = path.relative(process.cwd(), absolute).replace(/\\/g, '/');

    return {
      type: 'user',
      file: absolute,
      line,
      relativePath: relative,
      description: 'Mock user code',
    };
  }

  private handleMockPathAccess(
    sessionId: string,
    path: string,
    frameId: number,
    mockVariables: MockVariableScopes,
  ): CallToolResult {
    const pathParts = path.split('.');
    const [root, ...rest] = pathParts;

    try {
      let current: unknown;

      if (root in mockVariables.local) {
        current = mockVariables.local[root];
      } else if (root in mockVariables.closure) {
        current = mockVariables.closure[root];
      } else {
        return this.serializeMockVariableResult(sessionId, frameId, path, {
          found: false,
          error: `Variable '${root}' not found in mock session`,
        });
      }

      for (const part of rest) {
        if (
          current !== null &&
          typeof current === 'object' &&
          part in (current as Record<string, unknown>)
        ) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return this.serializeMockVariableResult(sessionId, frameId, path, {
            found: false,
            error: `Property '${part}' not found while traversing '${path}'`,
          });
        }
      }

      return this.serializeMockVariableResult(sessionId, frameId, path, {
        found: true,
        value: current,
        type: Array.isArray(current) ? 'array' : typeof current,
      });
    } catch (error) {
      return this.serializeMockVariableResult(
        sessionId,
        frameId,
        path,
        {
          found: false,
          error: `[MOCK] Error accessing path '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        true,
      );
    }
  }

  private serializeMockVariableResult(
    sessionId: string,
    frameId: number,
    path: string,
    result: {
      found: boolean;
      value?: unknown;
      type?: string;
      error?: string;
    },
    isError = false,
  ): CallToolResult {
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
      isError,
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
