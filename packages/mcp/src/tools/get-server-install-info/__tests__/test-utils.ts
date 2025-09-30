import { vi } from 'vitest';
import { CoreToolContext } from '../../core-tool.interface.js';

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

export function createMockFetchResponse(
  data: unknown,
  ok = true,
  status = 200,
  statusText = 'OK',
) {
  return {
    ok,
    status,
    statusText,
    json: async () => data,
  };
}

export function createServerSearchResponse(servers: unknown[]) {
  return createMockFetchResponse({
    servers,
    metadata: {
      count: servers.length,
      next_cursor: null,
    },
  });
}
