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

export function createEmptyRegistryResponse() {
  return createMockFetchResponse({
    servers: [],
    metadata: {
      count: 0,
      next_cursor: null,
    },
  });
}

export function createServerListResponse(servers: unknown[]) {
  return createMockFetchResponse({
    servers,
    metadata: {
      count: servers.length,
      next_cursor: null,
    },
  });
}
