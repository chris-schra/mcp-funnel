import { vi } from 'vitest';
import type { MCPProxy } from 'mcp-funnel';
import type { ServerType } from '@hono/node-server';

// Mock MCPProxy for testing
export const createMockMCPProxy = (): MCPProxy => {
  const mockProxy: Partial<MCPProxy> = {
    // @ts-expect-error Partial mock
    server: {
      connect: vi.fn(),
      sendToolListChanged: vi.fn(),
    },
    clients: new Map(),
    toolDefinitionCache: new Map(),
    toolMapping: new Map(),
    dynamicallyEnabledTools: new Set(),
    config: {
      servers: [],
      hideTools: [],
      exposeTools: [],
      exposeCoreTools: [],
    },
    completeOAuthFlow: vi.fn(),
    // Add EventEmitter methods for WebSocketManager
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    addListener: vi.fn(),
    setMaxListeners: vi.fn(),
    getMaxListeners: vi.fn().mockReturnValue(10),
    listeners: vi.fn().mockReturnValue([]),
    listenerCount: vi.fn().mockReturnValue(0),
    eventNames: vi.fn().mockReturnValue([]),
    rawListeners: vi.fn().mockReturnValue([]),
    prependListener: vi.fn(),
    prependOnceListener: vi.fn(),
  };

  // Return as MCPProxy - this is a test mock with only the needed properties
  return mockProxy as MCPProxy;
};

// Helper to close server
/**
 * Closes a Hono server instance and waits for completion.
 *
 * @param server - The server instance to close, or null if no server exists
 */
export async function closeServer(server: ServerType | null): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
}
