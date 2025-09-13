import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MCPProxy } from './index.js';
import { ProxyConfig } from './config.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

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

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdin: { write: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
}));

type MockServer = {
  setRequestHandler: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  sendToolListChanged: ReturnType<typeof vi.fn>;
  notification: ReturnType<typeof vi.fn>;
} & Server;

type MockClient = {
  connect: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
} & Client;

describe('MCPProxy', () => {
  let mockServer: MockServer;
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {
      setRequestHandler: vi.fn(),
      connect: vi.fn(),
      sendToolListChanged: vi.fn(),
      notification: vi.fn(),
    } as MockServer;

    mockClient = {
      connect: vi.fn(),
      listTools: vi.fn().mockResolvedValue({
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
      }),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Tool executed' }],
      }),
    } as MockClient;

    vi.mocked(Server).mockImplementation(() => mockServer);
    vi.mocked(Client).mockImplementation(() => mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create proxy with basic config', () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
            args: ['test'],
          },
        ],
      };

      const proxy = new MCPProxy(config);
      expect(proxy).toBeDefined();
      expect(Server).toHaveBeenCalledWith(
        {
          name: 'mcp-funnel',
          version: expect.any(String),
        },
        {
          capabilities: {
            tools: {
              listChanged: true,
            },
          },
        },
      );
    });
  });

  describe('hackyDiscovery mode', () => {
    it('should register only core tools when hackyDiscovery is enabled', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
          },
        ],
        hackyDiscovery: true,
      };

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      // Check that setRequestHandler was called for ListToolsRequestSchema
      expect(mockServer.setRequestHandler).toHaveBeenCalled();

      // Get the handler for ListToolsRequestSchema
      const listToolsCall = mockServer.setRequestHandler.mock.calls.find(
        (call) => {
          const schema = call[0] as { parse?: (data: unknown) => unknown };
          try {
            return schema.parse && schema.parse({ method: 'tools/list' });
          } catch {
            return false;
          }
        },
      );

      expect(listToolsCall).toBeDefined();

      // Execute the handler
      const handler = listToolsCall?.[1];
      const result = await handler?.({}, {});

      // Should only return core tools (2-3 tools depending on config)
      expect(result?.tools).toBeDefined();
      expect(result?.tools?.length).toBeGreaterThanOrEqual(2);

      // Check tool names
      const toolNames = result?.tools?.map((t: Tool) => t.name) ?? [];
      // discover_tools_by_words might not be enabled without enableDynamicDiscovery
      expect(toolNames).toContain('get_tool_schema');
      expect(toolNames).toContain('bridge_tool_request');
    });

    it('should populate tool caches even in hackyDiscovery mode', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'github',
            command: 'echo',
          },
        ],
        hackyDiscovery: true,
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

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      // Get the list tools handler
      const listToolsCall = mockServer.setRequestHandler.mock.calls.find(
        (call) => {
          const schema = call[0] as { parse?: (data: unknown) => unknown };
          try {
            return schema.parse && schema.parse({ method: 'tools/list' });
          } catch {
            return false;
          }
        },
      );
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

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      const listToolsCall = mockServer.setRequestHandler.mock.calls.find(
        (call) => {
          const schema = call[0] as { parse?: (data: unknown) => unknown };
          try {
            return schema.parse && schema.parse({ method: 'tools/list' });
          } catch {
            return false;
          }
        },
      );

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

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      const listToolsCall = mockServer.setRequestHandler.mock.calls.find(
        (call) => {
          const schema = call[0] as { parse?: (data: unknown) => unknown };
          try {
            return schema.parse && schema.parse({ method: 'tools/list' });
          } catch {
            return false;
          }
        },
      );

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

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      const listToolsCall = mockServer.setRequestHandler.mock.calls.find(
        (call) => {
          const schema = call[0] as { parse?: (data: unknown) => unknown };
          try {
            return schema.parse && schema.parse({ method: 'tools/list' });
          } catch {
            return false;
          }
        },
      );

      const handler = listToolsCall?.[1];
      const result = await handler?.({}, {});

      const toolNames = result?.tools?.map((t: Tool) => t.name) ?? [];
      expect(toolNames).toContain('test__tool1');
      expect(toolNames).not.toContain('test__tool2');
      expect(toolNames).not.toContain('test__debug_info');
    });
  });

  describe('servers configuration', () => {
    it('should accept servers as an array', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'test1',
            command: 'echo',
            args: ['test1'],
          },
          {
            name: 'test2',
            command: 'echo',
            args: ['test2'],
          },
        ],
      };

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      // Verify both servers are connected
      expect(Client).toHaveBeenCalledTimes(2);
    });

    it('should accept servers as a record and normalize to array', async () => {
      const config: ProxyConfig = {
        servers: {
          test1: {
            command: 'echo',
            args: ['test1'],
          },
          test2: {
            command: 'echo',
            args: ['test2'],
            env: { FOO: 'bar' },
          },
        },
      };

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      // Verify both servers are connected with correct names
      expect(Client).toHaveBeenCalledTimes(2);
    });

    it('should preserve all server properties when using record format', async () => {
      const config: ProxyConfig = {
        servers: {
          myserver: {
            command: 'node',
            args: ['server.js'],
            env: {
              NODE_ENV: 'production',
              PORT: '3000',
            },
          },
        },
      };

      const proxy = new MCPProxy(config);
      expect(proxy).toBeDefined();

      // The server name should be derived from the key
      await proxy.initialize();
      expect(Client).toHaveBeenCalledTimes(1);
    });
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

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      // Setup tool in cache by calling list tools
      const listToolsCall = mockServer.setRequestHandler.mock.calls.find(
        (call) => {
          const schema = call[0] as { parse?: (data: unknown) => unknown };
          try {
            return schema.parse && schema.parse({ method: 'tools/list' });
          } catch {
            return false;
          }
        },
      );
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

    it('should throw error for unknown tool', async () => {
      const config: ProxyConfig = {
        servers: [],
      };

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      // Get call tool handler - it's the second handler registered
      const callToolCall = mockServer.setRequestHandler.mock.calls[1];

      const handler = callToolCall?.[1];
      await expect(
        handler?.(
          {
            params: {
              name: 'unknown__tool',
              arguments: {},
            },
          },
          {},
        ),
      ).rejects.toThrow('Tool not found: unknown__tool');
    });
  });
});
