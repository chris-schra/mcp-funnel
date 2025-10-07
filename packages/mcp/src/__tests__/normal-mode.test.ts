import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MCPProxy } from '../index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
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

  describe('normal mode', () => {
    it('should expose all tools from connected servers', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
          },
        ],
      };

      mockClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'tool1',
            description: 'Tool 1',
            inputSchema: { type: 'object' },
          },
          {
            name: 'tool2',
            description: 'Tool 2',
            inputSchema: { type: 'object' },
          },
        ],
      });

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      await proxy.initialize();

      const listToolsCall = findListToolsHandler(mockServer);

      const handler = listToolsCall?.[1];
      const result = await handler?.({}, {});

      // Should include prefixed tools from server
      expect(result?.tools).toContainEqual(
        expect.objectContaining({
          name: 'test__tool1',
          description: '[test] Tool 1',
        }),
      );
      expect(result?.tools).toContainEqual(
        expect.objectContaining({
          name: 'test__tool2',
          description: '[test] Tool 2',
        }),
      );
    });

    it('should apply hideTools filtering', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
          },
        ],
        hideTools: ['test__tool2', 'test__debug_*'],
      };

      mockClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'tool1',
            description: 'Tool 1',
            inputSchema: { type: 'object' },
          },
          {
            name: 'tool2',
            description: 'Tool 2',
            inputSchema: { type: 'object' },
          },
          {
            name: 'debug_info',
            description: 'Debug tool',
            inputSchema: { type: 'object' },
          },
        ],
      });

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      await proxy.initialize();

      const listToolsCall = findListToolsHandler(mockServer);

      const handler = listToolsCall?.[1];
      const result = await handler?.({}, {});

      const toolNames = result?.tools?.map((t: Tool) => t.name) ?? [];
      expect(toolNames).toContain('test__tool1');
      expect(toolNames).not.toContain('test__tool2');
      expect(toolNames).not.toContain('test__debug_info');
    });
  });
});
