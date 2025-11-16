import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MCPProxy } from '../index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import { createMockServer, createMockClient, findListToolsHandler } from './test-utils.js';
import type { MockServer, MockClient } from './test-utils.js';

// Create hoisted mock for execAsync (needed for keychain-token-storage)
const mockExecAsync = vi.hoisted(() => vi.fn());

// Mock the SDK modules
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
    sendToolListChanged: vi.fn(),
    notification: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(() => ({
    connect: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn(),
  })),
}));

// Mock child_process (needs exec and execFile for keychain-token-storage)
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(() => ({
    stdin: { write: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
}));

// Mock util.promisify to return our hoisted mock function (for keychain-token-storage)
vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

// Mock fs promises (needed for keychain-token-storage)
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
  },
}));

describe('MCPProxy', () => {
  let mockServer: MockServer;
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

    mockServer = createMockServer();
    mockClient = createMockClient();

    vi.mocked(Server).mockImplementation(() => mockServer);
    vi.mocked(Client).mockImplementation(() => mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tool execution', () => {
    it('should handle CallToolRequest for proxied tools', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
          },
        ],
      };

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      await proxy.initialize();

      // Setup tool in cache by calling list tools
      const listToolsCall = findListToolsHandler(mockServer);
      await listToolsCall?.[1]?.({}, {});

      // Get call tool handler - it's the second handler registered
      const callToolCall = mockServer.setRequestHandler.mock.calls[1];

      const handler = callToolCall?.[1];
      const result = await handler?.(
        {
          params: {
            name: 'test__test_tool',
            arguments: { input: 'test' },
          },
        },
        {},
      );

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'test_tool',
        arguments: { input: 'test' },
      });
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Tool executed' }],
      });
    });

    it('should return error for unknown tool', async () => {
      const config: ProxyConfig = {
        servers: [],
      };

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      await proxy.initialize();

      // Get call tool handler - it's the second handler registered
      const callToolCall = mockServer.setRequestHandler.mock.calls[1];

      const handler = callToolCall?.[1];
      const result = await handler?.(
        {
          params: {
            name: 'unknown__tool',
            arguments: {},
          },
        },
        {},
      );

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Tool not found: unknown__tool' }],
        isError: true,
      });
    });
  });
});
