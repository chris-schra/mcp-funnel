import type {
  MockDebugSession,
  ConsoleMessage,
  BreakpointStatusSummary,
  DebugLocation,
} from '../../types/index.js';

/**
 * Represents the two scopes of variables in a mock debug session.
 *
 * Contains local variables (current function scope) and closure variables
 * (captured from outer scopes).
 * @public
 */
export type MockVariableScopes = {
  local: Record<string, unknown>;
  closure: Record<string, unknown>;
};

/**
 * Generates mock console messages filtered by verbosity level.
 *
 * Returns different sets of console messages based on the verbosity:
 * - 'all': Includes log messages and errors
 * - 'warn-error': Only warnings and errors
 * - 'error-only': Only error messages
 * - Other values: Empty array
 * @param verbosity - Console output verbosity level (defaults to 'all')
 * @returns Array of mock console messages
 * @example
 * ```typescript
 * const messages = createMockConsoleOutput('warn-error');
 * // Returns only warning and error messages
 * ```
 * @public
 * @see file:../../types/console.ts:3 - ConsoleMessage type definition
 */
export const createMockConsoleOutput = (
  verbosity: string = 'all',
): ConsoleMessage[] => {
  const messages: ConsoleMessage[] = [];

  if (verbosity === 'all') {
    messages.push({
      level: 'log',
      timestamp: new Date().toISOString(),
      message: 'Starting application...',
      args: ['Starting application...'],
    });
  }

  if (['all', 'warn-error', 'error-only'].includes(verbosity)) {
    messages.push({
      level: 'error',
      timestamp: new Date().toISOString(),
      message:
        'Error: Potential memory leak detected! EventEmitter has 11 listeners attached',
      args: [
        'Error: Potential memory leak detected! EventEmitter has 11 listeners attached',
      ],
    });
  }

  return messages;
};

/**
 * Creates a comprehensive set of mock variables for testing variable inspection.
 *
 * Generates both local and closure scope variables with diverse data types including:
 * - Primitives (numbers, booleans, strings)
 * - Nested objects and arrays
 * - Special types (Date, RegExp, Map, Set, Promise)
 * - Circular references
 * - Large arrays (150+ items)
 *
 * The generated variables are session-aware and include computed values based
 * on the current breakpoint index.
 * @param session - Mock debug session containing state for generating dynamic values
 * @returns Object with 'local' and 'closure' variable scopes
 * @example
 * ```typescript
 * const mockSession: MockDebugSession = { currentBreakpointIndex: 2, ... };
 * const vars = createMockVariables(mockSession);
 * console.log(vars.local.processedCount); // 62 (2 * 10 + 42)
 * ```
 * @public
 * @see file:../../types/handlers.ts:166 - MockDebugSession type definition
 */
export const createMockVariables = (
  session: MockDebugSession,
): MockVariableScopes => {
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
};

/**
 * Generates a mock call stack for the current debug location.
 *
 * Creates a stack trace with multiple frames, each representing a function call
 * in the call chain. Line numbers decrease going up the stack, and column numbers
 * vary to simulate realistic call positions.
 * @param location - Debug location representing the current execution point
 * @param functionNames - Function names in call order from innermost to outermost
 *                        (defaults to typical processing chain)
 * @returns Array of stack frames with file, line, and column information
 * @example
 * ```typescript
 * const location = { file: '/path/to/app.js', line: 42, type: 'user' };
 * const stack = createMockStackTrace(location, ['fetchData', 'init', 'main']);
 * // Returns 3 frames: fetchData at line 42, init at line 34, main at line 26
 * ```
 * @public
 * @see file:../../types/debug-state.ts:3 - DebugLocation type definition
 */
export const createMockStackTrace = (
  location: DebugLocation,
  functionNames: string[] = ['processUserData', 'handleRequest', 'main'],
) => {
  return functionNames.map((functionName, index) => ({
    frameId: index,
    functionName,
    file: location.file || 'main.js',
    relativePath: location.relativePath,
    origin: 'user' as const,
    line: Math.max(1, (location.line ?? 15) - index * 8),
    column: index === 0 ? (location.column ?? 12) : index === 1 ? 4 : 1,
  }));
};

/**
 * Generates a summary of breakpoint registration status.
 *
 * Returns statistics about requested and successfully set breakpoints. In the mock
 * implementation, all requested breakpoints are considered successfully set with no
 * pending breakpoints.
 * @param session - Mock debug session containing the breakpoint requests
 * @returns Breakpoint status summary, or undefined if no breakpoints were requested
 * @example
 * ```typescript
 * const session: MockDebugSession = {
 *   request: { breakpoints: [{ file: 'app.js', line: 10 }] },
 *   ...
 * };
 * const summary = createMockBreakpointsSummary(session);
 * // Returns { requested: 1, set: 1, pending: [] }
 * ```
 * @public
 * @see file:../../types/breakpoint.ts:32 - BreakpointStatusSummary type definition
 */
export const createMockBreakpointsSummary = (
  session: MockDebugSession,
): BreakpointStatusSummary | undefined => {
  const requested = session.request.breakpoints ?? [];
  if (requested.length === 0) {
    return undefined;
  }

  return {
    requested: requested.length,
    set: requested.length,
    pending: [],
  };
};

/**
 * Evaluates a JavaScript expression in mock mode by pattern matching.
 *
 * Simulates expression evaluation by recognizing common patterns:
 * - `console.log(...)` returns undefined
 * - Pure numbers return themselves as numbers
 * - `typeof ...` returns "object" as a string
 * - Other expressions return a mock placeholder string
 * @param expression - JavaScript expression to evaluate
 * @returns Evaluation result with expression, result value, and type
 * @example
 * ```typescript
 * const result = createMockEvaluationResult('42');
 * // Returns { expression: '42', result: '42', type: 'number' }
 *
 * const log = createMockEvaluationResult('console.log("test")');
 * // Returns { expression: 'console.log("test")', result: 'undefined', type: 'undefined' }
 * ```
 * @public
 */
export const createMockEvaluationResult = (expression: string) => {
  // Handle some common expression patterns
  if (expression.includes('console.log')) {
    return {
      expression,
      result: 'undefined',
      type: 'undefined',
      description: 'Function executed successfully',
    };
  }

  if (expression.match(/^\d+$/)) {
    return {
      expression,
      result: expression,
      type: 'number',
    };
  }

  if (expression.startsWith('typeof ')) {
    return {
      expression,
      result: '"object"',
      type: 'string',
    };
  }

  // Default mock evaluation
  return {
    expression,
    result: `[Mock evaluated: ${expression}]`,
    type: 'string',
  };
};

/**
 * Formats console messages for response output, limiting to the most recent messages.
 *
 * Takes the last 10 messages and transforms them into a simplified format suitable
 * for display in debug responses.
 * @param messages - Array of console messages to format
 * @returns Array of formatted console messages (up to last 10)
 * @example
 * ```typescript
 * const messages: ConsoleMessage[] = [...]; // 50 messages
 * const formatted = formatMockConsoleOutput(messages);
 * // Returns only the last 10 messages
 * ```
 * @public
 * @see file:../../types/console.ts:3 - ConsoleMessage type definition
 */
export const formatMockConsoleOutput = (messages: ConsoleMessage[]) => {
  return messages.slice(-10).map((msg) => ({
    level: msg.level,
    timestamp: msg.timestamp,
    message: msg.message,
    args: msg.args,
  }));
};
