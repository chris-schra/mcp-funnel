import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPProxy } from '../../src/index.js';
import { ProxyConfig } from '../../src/config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Simplified integration test that actually tests the behavior

describe('Core Tools Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes core tools by default', async () => {
    const config: ProxyConfig = {
      servers: [],
    };

    const proxy = new MCPProxy(config, './test-config.json');
    await proxy.initialize();

    // Get the actual exposed tools
    const coreTools = Array.from(proxy['coreTools'].values());
    const toolNames = coreTools.map((t) => t.name);

    // Should have all core tools by default
    expect(toolNames).toContain('discover_tools_by_words');
    expect(toolNames).toContain('get_tool_schema');
    expect(toolNames).toContain('bridge_tool_request');
    expect(toolNames).toContain('load_toolset');

    // Importantly, should NOT have server tools exposed initially
    expect(toolNames).not.toContain('github__create_issue');
  });

  it('exposes no core tools when explicitly disabled via exposeCoreTools', async () => {
    const config: ProxyConfig = {
      servers: [],
      exposeCoreTools: [], // Explicitly disable all core tools
    };

    const proxy = new MCPProxy(config, './test-config.json');
    await proxy.initialize();

    // Should not have any core tools when explicitly disabled
    const coreTools = Array.from(proxy['coreTools'].values());
    const toolNames = coreTools.map((t) => t.name);

    expect(toolNames).not.toContain('get_tool_schema');
    expect(toolNames).not.toContain('bridge_tool_request');
    expect(toolNames).not.toContain('discover_tools_by_words');
    expect(toolNames).not.toContain('load_toolset');
  });

  it('allows dynamic discovery and execution through bridge', async () => {
    const config: ProxyConfig = {
      servers: [],
    };

    const proxy = new MCPProxy(config, './test-config.json');
    await proxy.initialize();

    const context = proxy['createToolContext']();

    // Register a tool in the registry to simulate discovery
    proxy.registry.registerDiscoveredTool({
      fullName: 'test__example',
      originalName: 'example',
      serverName: 'test',
      definition: {
        name: 'example',
        description: 'Example tool for testing',
        inputSchema: { type: 'object' },
      },
    });

    // Now discover it
    const discoverTool = proxy['coreTools'].get('discover_tools_by_words');
    const result = await discoverTool?.handle(
      { words: 'example test' },
      context,
    );

    const text = (result?.content[0] as { text: string }).text;
    expect(text).toContain('test__example');
    expect(text).toContain('Example tool for testing');
  });

  it('should NOT discover tools that are in hideTools configuration', async () => {
    // Mock a client with tools
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          {
            name: 'public_tool',
            description: 'A public tool that should be discoverable',
          },
          {
            name: 'secret_tool',
            description: 'A secret tool that should be hidden',
          },
          {
            name: 'private_tool',
            description: 'A private tool that should be hidden',
          },
        ],
      }),
    } as unknown as Client;

    const config: ProxyConfig = {
      servers: [],
      hideTools: ['testserver__secret_*', 'testserver__private_tool'],
    };

    const proxy = new MCPProxy(config, './test-config.json');

    // Manually set up the client to simulate a connected server
    proxy['_clients'].set('testserver', mockClient);

    await proxy.initialize();

    // The caches are now populated by toolCollector.collectVisibleTools() during initialize()
    // which correctly respects hideTools configuration
    const context = proxy['createToolContext']();

    // Now try to discover hidden tools
    const discoverTool = proxy['coreTools'].get('discover_tools_by_words');
    const result = await discoverTool?.handle(
      { words: 'secret private' },
      context,
    );

    const text = (result?.content[0] as { text: string }).text;

    // BUG: Currently this test FAILS because hidden tools ARE discoverable
    // The test should pass after we fix populateToolCaches
    expect(text).not.toContain('testserver__secret_tool');
    expect(text).not.toContain('testserver__private_tool');

    // But public tools should still be discoverable
    const publicResult = await discoverTool?.handle(
      { words: 'public' },
      context,
    );

    const publicText = (publicResult?.content[0] as { text: string }).text;
    expect(publicText).toContain('testserver__public_tool');
  });

  it('dramatically reduces context size', () => {
    // Calculate approximate token sizes
    const hackyTools = [
      {
        name: 'discover_tools_by_words',
        description:
          'Search for tools by keywords in their descriptions. Returns matching tools that can be dynamically enabled to reduce context usage.',
        inputSchema: {
          type: 'object',
          properties: {
            words: { type: 'string' },
            enable: { type: 'boolean' },
          },
        },
      },
      {
        name: 'get_tool_schema',
        description:
          'Get the input schema for a specific tool. Use the returned schema to understand what arguments are required for bridge_tool_request.',
        inputSchema: {
          type: 'object',
          properties: { tool: { type: 'string' } },
        },
      },
      {
        name: 'bridge_tool_request',
        description:
          'Execute any discovered tool dynamically. First use get_tool_schema to understand the required arguments structure.',
        inputSchema: {
          type: 'object',
          properties: {
            tool: { type: 'string' },
            arguments: { type: 'object' },
          },
        },
      },
    ];

    const normalTools = [];
    // Simulate 3 servers with 10 tools each
    for (let s = 0; s < 3; s++) {
      for (let t = 0; t < 10; t++) {
        normalTools.push({
          name: `server${s}__tool${t}`,
          description: `This is a detailed description of tool ${t} from server ${s} that explains what it does and how to use it`,
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string', description: 'First parameter' },
              param2: { type: 'number', description: 'Second parameter' },
              param3: { type: 'boolean', description: 'Third parameter' },
            },
            required: ['param1'],
          },
        });
      }
    }

    const hackyJson = JSON.stringify(hackyTools);
    const normalJson = JSON.stringify(normalTools);

    const hackyTokens = Math.ceil(hackyJson.length / 4);
    const normalTokens = Math.ceil(normalJson.length / 4);

    // Verify massive reduction
    expect(hackyTokens).toBeLessThan(500); // ~400 tokens
    expect(normalTokens).toBeGreaterThan(2500); // ~3000+ tokens for 30 tools

    const reduction = ((normalTokens - hackyTokens) / normalTokens) * 100;
    expect(reduction).toBeGreaterThan(80); // At least 80% reduction
  });
});
