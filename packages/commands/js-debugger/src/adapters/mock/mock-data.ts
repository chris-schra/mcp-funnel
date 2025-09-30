import type {
  MockDebugSession,
  ConsoleMessage,
  BreakpointStatusSummary,
  DebugLocation,
} from '../../types/index.js';

/**
 * Type definition for mock variable scopes
 */
export type MockVariableScopes = {
  local: Record<string, unknown>;
  closure: Record<string, unknown>;
};

/**
 * Mock console messages based on verbosity settings
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
 * Create comprehensive mock variables for testing with sophisticated data structures
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
 * Create mock stack trace for a given location
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
 * Mock breakpoint status summary
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
 * Mock evaluation results for different expression types
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
 * Format console output for responses
 */
export const formatMockConsoleOutput = (messages: ConsoleMessage[]) => {
  return messages.slice(-10).map((msg) => ({
    level: msg.level,
    timestamp: msg.timestamp,
    message: msg.message,
    args: msg.args,
  }));
};
