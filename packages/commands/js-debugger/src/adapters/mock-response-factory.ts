import type {
  CallToolResult,
  MockDebugSession,
  DebugRequest,
  ConsoleMessage,
} from '../types/index.js';

/**
 * Create breakpoint paused response
 */
export function createBreakpointPausedResponse(
  sessionId: string,
  session: MockDebugSession,
  action?: string,
): CallToolResult {
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
            action: action || 'continue',
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
 * Create initial breakpoint response
 */
export function createInitialBreakpointResponse(
  sessionId: string,
  request: DebugRequest,
  consoleOutput: ConsoleMessage[],
): CallToolResult {
  const bp = request.breakpoints![0];
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
              total: request.breakpoints!.length,
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
            consoleOutput,
            message: `[MOCK] Paused at breakpoint 1 of ${request.breakpoints!.length}. Use js-debugger_continue tool with sessionId "${sessionId}" to proceed.`,
          },
          null,
          2,
        ),
      },
    ],
  };
}

/**
 * Create stack trace mock response
 */
export function createStackTraceMockResponse(
  sessionId: string,
  session: MockDebugSession,
): CallToolResult {
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
