import type { ProxyConfig } from '@mcp-funnel/schemas';

export const mockConfig: ProxyConfig = {
  servers: [
    {
      name: 'test-server',
      command: 'echo',
      args: ['test'],
    },
  ],
};

/**
 * Creates a mock fetch response for testing HTTP requests.
 *
 * @param data - Response body data to return
 * @param ok - Whether the response is successful (default: true)
 * @param status - HTTP status code (default: 200)
 * @param statusText - HTTP status text (default: 'OK')
 * @returns Mock response object with ok, status, statusText, and json method
 */
export function createMockFetchResponse(
  data: unknown,
  ok = true,
  status = 200,
  statusText = 'OK',
) {
  return {
    ok,
    status,
    statusText: ok ? statusText : 'Error',
    json: () => Promise.resolve(data),
  };
}

/**
 * Creates a mock empty registry response with no servers.
 *
 * @returns Mock fetch response with empty server list
 */
export function createEmptyRegistryResponse() {
  return createMockFetchResponse({
    servers: [],
    metadata: {
      count: 0,
      next_cursor: null,
    },
  });
}

/**
 * Creates a mock registry response with a list of servers.
 *
 * @param servers - Array of server objects to include in the response
 * @returns Mock fetch response with server list and metadata
 */
export function createServerListResponse(servers: unknown[]) {
  return createMockFetchResponse({
    servers,
    metadata: {
      count: servers.length,
      next_cursor: null,
    },
  });
}
