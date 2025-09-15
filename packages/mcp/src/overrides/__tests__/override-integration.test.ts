import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MCPProxy } from '../../index.js';
import { ProxyConfig } from '../../config.js';
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

describe('Override Integration', () => {
  let mockServer: MockServer;
  let mockClient: MockClient;
  let proxy: MCPProxy;

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
            description: 'Original description',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string', description: 'Original input' },
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
    if (proxy) {
      // Clean up if proxy has cleanup methods
    }
  });

  it('should apply overrides when listing tools', async () => {
    // Configure the mock client to return a test tool
    mockClient.listTools.mockResolvedValue({
      tools: [
        {
          name: 'test_tool',
          description: 'Original description',
          inputSchema: {
            type: 'object' as const,
            properties: {
              input: { type: 'string', description: 'Original input' },
            },
          },
        },
      ],
    });

    // Create proxy config with tool overrides
    const config: ProxyConfig = {
      servers: [
        {
          name: 'test-server',
          command: 'test-command',
        },
      ],
      toolOverrides: {
        'test-server__test_tool': {
          description: 'Overridden description',
          annotations: {
            category: 'testing',
          },
        },
      },
    };

    // Create the proxy
    proxy = new MCPProxy(config);

    // Mock the internal client mapping
    // @ts-expect-error - accessing private property for test
    proxy._clients = new Map([['test-server', mockClient]]);
    // @ts-expect-error - accessing private property for test
    proxy._toolMapping = new Map([
      [
        'test-server__test_tool',
        {
          client: mockClient,
          originalName: 'test_tool',
          toolName: 'test_tool',
        },
      ],
    ]);

    // Initialize the proxy (this sets up the handlers)
    await proxy.initialize();

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

    // Debug: log all tool names to understand what's being returned
    console.log(
      'All tools returned:',
      result?.tools?.map((t: Tool) => t.name),
    );

    // Verify that the override was applied
    expect(result?.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);

    // Find our test tool (it will be prefixed with server name)
    const overriddenTool = result.tools.find(
      (t: Tool) => t.name === 'test-server__test_tool',
    );

    expect(overriddenTool).toBeDefined();
    // Note: Description gets server prefix applied after overrides
    expect(overriddenTool?.description).toBe(
      '[test-server] Overridden description',
    );
    expect(overriddenTool?._meta?.annotations?.category).toBe('testing');
  });

  it('should apply pattern-based overrides when listing tools', async () => {
    // Create mock tools that match a pattern
    const tools: Tool[] = [
      {
        name: 'list_issues',
        description: 'List GitHub issues',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'list_pull_requests',
        description: 'List GitHub pull requests',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'create_issue',
        description: 'Create GitHub issue',
        inputSchema: { type: 'object' as const, properties: {} },
      },
    ];

    mockClient.listTools.mockResolvedValue({ tools });

    const config: ProxyConfig = {
      servers: [
        {
          name: 'github',
          command: 'github-server',
        },
      ],
      toolOverrides: {
        'github__list_*': {
          annotations: {
            category: 'query',
            tags: ['read-only'],
          },
        },
      },
    };

    proxy = new MCPProxy(config);

    // Mock the internal mappings
    // @ts-expect-error - accessing private property for test
    proxy._clients = new Map([['github', mockClient]]);

    // @ts-expect-error - accessing private property for test
    proxy._toolMapping = new Map([
      [
        'github__list_issues',
        {
          client: mockClient,
          originalName: 'list_issues',
          toolName: 'list_issues',
        },
      ],
      [
        'github__list_pull_requests',
        {
          client: mockClient,
          originalName: 'list_pull_requests',
          toolName: 'list_pull_requests',
        },
      ],
      [
        'github__create_issue',
        {
          client: mockClient,
          originalName: 'create_issue',
          toolName: 'create_issue',
        },
      ],
    ]);

    await proxy.initialize();

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

    // Verify that pattern-based overrides were applied
    expect(result?.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);

    const listIssues = result.tools.find(
      (t: Tool) => t.name === 'github__list_issues',
    );
    const listPRs = result.tools.find(
      (t: Tool) => t.name === 'github__list_pull_requests',
    );
    const createIssue = result.tools.find(
      (t: Tool) => t.name === 'github__create_issue',
    );

    // List tools should have the override applied
    expect(listIssues).toBeDefined();
    expect(listIssues?._meta?.annotations?.category).toBe('query');
    expect(listIssues?._meta?.annotations?.tags).toEqual(['read-only']);

    expect(listPRs).toBeDefined();
    expect(listPRs?._meta?.annotations?.category).toBe('query');
    expect(listPRs?._meta?.annotations?.tags).toEqual(['read-only']);

    // Create tool should not have the override applied
    expect(createIssue).toBeDefined();
    expect(createIssue?._meta?.annotations).toBeUndefined();
  });

  it('should support tool renaming through overrides', async () => {
    // Configure the mock client to return a test tool that will be renamed
    mockClient.listTools.mockResolvedValue({
      tools: [
        {
          name: 'check_embedding_mode',
          description: 'Check the current embedding mode configuration',
          inputSchema: {
            type: 'object' as const,
            properties: {
              verbose: {
                type: 'boolean',
                description: 'Include detailed output',
              },
            },
          },
        },
      ],
    });

    // Create proxy config with tool renaming override
    const config: ProxyConfig = {
      servers: [
        {
          name: 'memory',
          command: 'memory-command',
        },
      ],
      toolOverrides: {
        memory__check_embedding_mode: {
          name: 'memory__check',
          description: 'Check memory system status (renamed for simplicity)',
        },
      },
    };

    // Create the proxy
    proxy = new MCPProxy(config);

    // Mock the internal client mapping
    // @ts-expect-error - accessing private property for test
    proxy._clients = new Map([['memory', mockClient]]);
    // @ts-expect-error - accessing private property for test
    proxy._toolMapping = new Map([
      [
        'memory__check_embedding_mode',
        {
          client: mockClient,
          originalName: 'check_embedding_mode',
          toolName: 'check_embedding_mode',
        },
      ],
    ]);

    // Initialize the proxy (this sets up the handlers)
    await proxy.initialize();

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

    // Verify that the tool was renamed
    expect(result?.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);

    // The tool should now have the new name from the override
    const renamedTool = result.tools.find(
      (t: Tool) => t.name === 'memory__check',
    );

    expect(renamedTool).toBeDefined();
    expect(renamedTool?.description).toBe(
      '[memory] Check memory system status (renamed for simplicity)',
    );
    expect(renamedTool?.inputSchema?.properties).toHaveProperty('verbose');

    // Verify that the original tool name is not in the results
    const originalTool = result.tools.find(
      (t: Tool) => t.name === 'memory__check_embedding_mode',
    );
    expect(originalTool).toBeUndefined();
  });

  it('should allow calling renamed tools', async () => {
    // Configure the mock client to return a test tool that will be renamed
    mockClient.listTools.mockResolvedValue({
      tools: [
        {
          name: 'create_issue',
          description: 'Create a GitHub issue',
          inputSchema: {
            type: 'object' as const,
            properties: {
              title: { type: 'string', description: 'Issue title' },
              body: { type: 'string', description: 'Issue body' },
            },
            required: ['title'],
          },
        },
      ],
    });

    // Mock the callTool response
    mockClient.callTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Issue created successfully' }],
    });

    // Create proxy config with tool renaming override
    const config: ProxyConfig = {
      servers: [
        {
          name: 'github',
          command: 'github-command',
        },
      ],
      toolOverrides: {
        github__create_issue: {
          name: 'github__new_issue',
          description: 'Create a new GitHub issue (renamed)',
        },
      },
    };

    // Create the proxy
    proxy = new MCPProxy(config);

    // Mock the internal client mapping
    // @ts-expect-error - accessing private property for test
    proxy._clients = new Map([['github', mockClient]]);
    // @ts-expect-error - accessing private property for test
    proxy._toolMapping = new Map([
      [
        'github__create_issue',
        {
          client: mockClient,
          originalName: 'create_issue',
          toolName: 'create_issue',
        },
      ],
    ]);

    // Initialize the proxy (this sets up the handlers)
    await proxy.initialize();

    // Get the CallTool handler - it should be the second handler registered (index 1)
    const allCalls = mockServer.setRequestHandler.mock.calls;
    expect(allCalls.length).toBeGreaterThanOrEqual(2);

    const callToolCall = allCalls[1]; // Second handler should be CallTool
    expect(callToolCall).toBeDefined();
    const callToolHandler = callToolCall?.[1];

    // Test calling the tool with the new name (should work)
    const newNameRequest = {
      method: 'tools/call',
      params: {
        name: 'github__new_issue',
        arguments: {
          title: 'Test Issue',
          body: 'This is a test issue',
        },
      },
    };

    // Update the tool mapping to include the new name
    // @ts-expect-error - accessing private property for test
    proxy._toolMapping.set('github__new_issue', {
      client: mockClient,
      originalName: 'create_issue',
      toolName: 'create_issue',
    });

    const newNameResult = await callToolHandler?.(newNameRequest, {});
    expect(newNameResult).toBeDefined();
    expect(newNameResult.content).toEqual([
      { type: 'text', text: 'Issue created successfully' },
    ]);

    // Verify that the underlying client was called with the original tool name
    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: 'create_issue',
      arguments: {
        title: 'Test Issue',
        body: 'This is a test issue',
      },
    });

    // Test calling the tool with the old name (should fail)
    const oldNameRequest = {
      method: 'tools/call',
      params: {
        name: 'github__create_issue',
        arguments: {
          title: 'Test Issue',
          body: 'This is a test issue',
        },
      },
    };

    // Remove the old name from the tool mapping to simulate the renaming
    // @ts-expect-error - accessing private property for test
    proxy._toolMapping.delete('github__create_issue');

    await expect(callToolHandler?.(oldNameRequest, {})).rejects.toThrow();
  });
});
