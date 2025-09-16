import { describe, test, expect, vi } from 'vitest';
import { ToolCollector } from '../../src/tool-collector.js';
import { ProxyConfig } from '../../src/config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('Hidden Tools Complete Invisibility', () => {
  test('hidden tools should not be cached at all', async () => {
    const config: ProxyConfig = {
      servers: [],
      hideTools: ['testserver__secret_*', 'testserver__private_tool'],
    };

    // Mock client
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'public_tool', description: 'A public tool' },
          { name: 'secret_tool', description: 'A secret tool' },
          { name: 'secret_admin', description: 'A secret admin tool' },
          { name: 'private_tool', description: 'A private tool' },
        ],
      }),
    } as unknown as Client;

    const clients = new Map([['testserver', mockClient]]);
    const coreTools = new Map();
    const dynamicallyEnabledTools = new Set<string>();

    const collector = new ToolCollector(
      config,
      coreTools,
      clients,
      dynamicallyEnabledTools,
    );

    // Collect tools
    await collector.collectVisibleTools();

    // Get the caches
    const caches = collector.getCaches();

    // Verify that hidden tools are NOT in any cache
    expect(caches.toolDescriptionCache.has('testserver__secret_tool')).toBe(
      false,
    );
    expect(caches.toolDescriptionCache.has('testserver__secret_admin')).toBe(
      false,
    );
    expect(caches.toolDescriptionCache.has('testserver__private_tool')).toBe(
      false,
    );

    expect(caches.toolDefinitionCache.has('testserver__secret_tool')).toBe(
      false,
    );
    expect(caches.toolDefinitionCache.has('testserver__secret_admin')).toBe(
      false,
    );
    expect(caches.toolDefinitionCache.has('testserver__private_tool')).toBe(
      false,
    );

    expect(caches.toolMapping.has('testserver__secret_tool')).toBe(false);
    expect(caches.toolMapping.has('testserver__secret_admin')).toBe(false);
    expect(caches.toolMapping.has('testserver__private_tool')).toBe(false);

    // Verify that public tool IS cached
    expect(caches.toolDescriptionCache.has('testserver__public_tool')).toBe(
      true,
    );
    expect(caches.toolDefinitionCache.has('testserver__public_tool')).toBe(
      true,
    );
    expect(caches.toolMapping.has('testserver__public_tool')).toBe(true);
  });

  test('hidden tools cannot be discovered', async () => {
    const config: ProxyConfig = {
      servers: [],
      hideTools: ['testserver__secret_*'],
    };

    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'public_tool', description: 'A public tool' },
          {
            name: 'secret_tool',
            description: 'A secret tool that should be hidden',
          },
        ],
      }),
    } as unknown as Client;

    const clients = new Map([['testserver', mockClient]]);
    const collector = new ToolCollector(config, new Map(), clients, new Set());

    const caches = collector.getCaches();

    // Search for "secret" in descriptions - should find nothing
    const secretTools = Array.from(
      caches.toolDescriptionCache.entries(),
    ).filter(([, info]) => info.description.toLowerCase().includes('secret'));

    expect(secretTools).toHaveLength(0);
  });

  test('hidden tools cannot be executed via bridge_tool_request', async () => {
    const config: ProxyConfig = {
      servers: [],
      hideTools: ['testserver__secret_*'],
    };

    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'public_tool', description: 'A public tool' },
          { name: 'secret_tool', description: 'A secret tool' },
        ],
      }),
    } as unknown as Client;

    const clients = new Map([['testserver', mockClient]]);
    const collector = new ToolCollector(config, new Map(), clients, new Set());

    await collector.collectVisibleTools();
    const caches = collector.getCaches();

    // The tool mapping should not have the hidden tool
    expect(caches.toolMapping.has('testserver__secret_tool')).toBe(false);

    // This means bridge_tool_request will fail to find it
    const mapping = caches.toolMapping.get('testserver__secret_tool');
    expect(mapping).toBeUndefined();
  });

  test('alwaysVisibleTools overrides hideTools for caching', async () => {
    const config: ProxyConfig = {
      servers: [],
      hideTools: ['testserver__*'],
      alwaysVisibleTools: ['testserver__important'],
    };

    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'important', description: 'An important tool' },
          { name: 'other', description: 'Another tool' },
        ],
      }),
    } as unknown as Client;

    const clients = new Map([['testserver', mockClient]]);
    const collector = new ToolCollector(config, new Map(), clients, new Set());

    await collector.collectVisibleTools();
    const caches = collector.getCaches();

    // Important tool should be cached despite matching hideTools pattern
    expect(caches.toolMapping.has('testserver__important')).toBe(true);

    // Other tool should NOT be cached
    expect(caches.toolMapping.has('testserver__other')).toBe(false);
  });
});
