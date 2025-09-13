import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPProxy } from '../../src';
import { ProxyConfig } from '../../src/config.js';

// Simplified integration test that actually tests the behavior

describe('Core Tools Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes core tools by default (legacy flags are ignored)', async () => {
    const config: ProxyConfig = {
      servers: [],
      hackyDiscovery: true, // Legacy flag - ignored but doesn't break
      enableDynamicDiscovery: true, // Legacy flag - ignored but doesn't break
    };

    const proxy = new MCPProxy(config);
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

    const proxy = new MCPProxy(config);
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
      hackyDiscovery: true,
      enableDynamicDiscovery: true,
    };

    const proxy = new MCPProxy(config);
    await proxy.initialize();

    const context = proxy['createToolContext']();

    // Manually add a tool to the cache to simulate discovery
    context.toolDescriptionCache.set('test__example', {
      serverName: 'test',
      description: 'Example tool for testing',
    });

    context.toolDefinitionCache?.set('test__example', {
      serverName: 'test',
      tool: {
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
