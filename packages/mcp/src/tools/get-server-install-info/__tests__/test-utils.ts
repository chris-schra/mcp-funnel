import { vi } from 'vitest';
import { CoreToolContext } from '../../core-tool.interface.js';

/**
 * Creates a mock CoreToolContext for testing tools.
 *
 * @returns Mock context with minimal tool registry and configuration
 */
export function createMockContext(): CoreToolContext {
  return {
    toolRegistry: {} as CoreToolContext['toolRegistry'],
    toolDescriptionCache: new Map(),
    dynamicallyEnabledTools: new Set(),
    config: {
      servers: [],
    },
    configPath: './.mcp-funnel.json',
    enableTools: vi.fn(),
  };
}

/**
 * Creates a mock fetch response for testing HTTP requests.
 *
 * @param data - Response body data to return
 * @param ok - Whether the response is successful (default: true)
 * @param status - HTTP status code (default: 200)
 * @param statusText - HTTP status text (default: 'OK')
 * @returns Mock response object with ok, status, statusText, and json method
 */
export function createMockFetchResponse(data: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText,
    json: async () => data,
  };
}

/**
 * Creates a mock server search response.
 *
 * @param servers - Array of server objects to include in the search results
 * @returns Mock fetch response with server list and metadata
 */
export function createServerSearchResponse(servers: unknown[]) {
  return createMockFetchResponse({
    servers,
    metadata: {
      count: servers.length,
      next_cursor: null,
    },
  });
}
