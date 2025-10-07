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

  describe('exposeCoreTools mode', () => {
    it('should register only core tools when exposeCoreTools is configured', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
          },
        ],
        exposeTools: [], // Empty array means no server tools exposed
        exposeCoreTools: [
          'discover_tools_by_words',
          'bridge_tool_request',
          'load_toolset',
          'get_tool_schema',
        ],
      };

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      await proxy.initialize();

      // Check that setRequestHandler was called for ListToolsRequestSchema
      expect(mockServer.setRequestHandler).toHaveBeenCalled();

      // Get the handler for ListToolsRequestSchema
      const listToolsCall = findListToolsHandler(mockServer);

      expect(listToolsCall).toBeDefined();

      // Execute the handler
      const handler = listToolsCall?.[1];
      const result = await handler?.({}, {});

      // Should only return core tools (4 tools as specified in config)
      expect(result?.tools).toBeDefined();

      // Check tool names to see what we actually have
      const toolNames = result?.tools?.map((t: Tool) => t.name) ?? [];
      console.log('Returned tools:', toolNames);

      // All 4 core tools should be present
      expect(toolNames).toContain('discover_tools_by_words');
      expect(toolNames).toContain('get_tool_schema');
      expect(toolNames).toContain('bridge_tool_request');
      expect(toolNames).toContain('load_toolset');

      expect(result?.tools?.length).toBe(4);
    });

    it('should populate tool caches even in exposeCoreTools mode', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'github',
            command: 'echo',
          },
        ],
        exposeCoreTools: [
          'discover_tools_by_words',
          'bridge_tool_request',
          'load_toolset',
          'get_tool_schema',
        ],
      };

      mockClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'create_issue',
            description: 'Create a GitHub issue',
            inputSchema: { type: 'object' },
          },
          {
            name: 'list_issues',
            description: 'List GitHub issues',
            inputSchema: { type: 'object' },
          },
        ],
      });

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      await proxy.initialize();

      // Get the list tools handler
      const listToolsCall = findListToolsHandler(mockServer);
      const handler = listToolsCall?.[1];
      await handler?.({}, {});

      // Verify that listTools was called to populate caches
      expect(mockClient.listTools).toHaveBeenCalled();
    });

    it('should not register core tools when explicitly excluded via exposeCoreTools', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
          },
        ],
        exposeCoreTools: ['nonexistent_tool'], // Only expose a non-existent tool, effectively disabling all
      };

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      await proxy.initialize();

      const listToolsCall = findListToolsHandler(mockServer);

      const handler = listToolsCall?.[1];
      const result = await handler?.({}, {});

      // Should not include any core tools
      const toolNames = result?.tools?.map((t: Tool) => t.name) ?? [];
      expect(toolNames).not.toContain('get_tool_schema');
      expect(toolNames).not.toContain('bridge_tool_request');
      expect(toolNames).not.toContain('discover_tools_by_words');
      expect(toolNames).not.toContain('load_toolset');
    });
  });
});
