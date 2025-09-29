import type { CallToolResult, ConsoleMessage } from '../types/index.js';

/**
 * Create an error response for mock operations
 */
export function createMockErrorResponse(
  error: string,
  sessionId: string,
): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error,
          sessionId,
        }),
      },
    ],
    isError: true,
  };
}

/**
 * Create a session not found error response
 */
export function createSessionNotFoundResponse(
  sessionId: string,
): CallToolResult {
  return createMockErrorResponse('Mock session not found', sessionId);
}

/**
 * Format console messages for output
 */
export function formatConsoleMessages(
  messages: ConsoleMessage[],
): ConsoleMessage[] {
  return messages.slice(-10).map((msg) => ({
    level: msg.level,
    timestamp: msg.timestamp,
    message: msg.message,
    args: msg.args,
  }));
}
