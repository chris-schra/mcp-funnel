import type { MockDebugSession } from '../types/index.js';

export type MockVariableScopes = {
  local: Record<string, unknown>;
  closure: Record<string, unknown>;
  global: Record<string, unknown>;
};

/**
 * Create comprehensive mock variables for testing
 */
export function createMockVariables(
  session: MockDebugSession,
): MockVariableScopes {
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
