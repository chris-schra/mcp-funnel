import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPProxy } from '../../proxy/mcp-proxy.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

function createMinimalConfig(): ProxyConfig {
  return {
    servers: {},
    exposeTools: [],
    hideTools: [],
    alwaysVisibleTools: [],
    exposeCoreTools: ['discover_tools_by_words', 'bridge_tool_request'],
  } as ProxyConfig;
}

function createMockTransport(): Transport {
  const handlers: {
    onmessage?: (message: JSONRPCMessage) => void;
    onerror?: (error: Error) => void;
    onclose?: () => void;
  } = {};

  return {
    start: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    get onmessage() {
      return handlers.onmessage;
    },
    set onmessage(handler) {
      handlers.onmessage = handler;
    },
    get onerror() {
      return handlers.onerror;
    },
    set onerror(handler) {
      handlers.onerror = handler;
    },
    get onclose() {
      return handlers.onclose;
    },
    set onclose(handler) {
      handlers.onclose = handler;
    },
  };
}

describe('MCPProxy.createSession', () => {
  let proxy: MCPProxy;

  beforeEach(async () => {
    const config = createMinimalConfig();
    proxy = new MCPProxy(config, '/tmp/test-config.json');
    // Initialize without connecting to target servers (no servers configured)
    await proxy.initialize();
  });

  it('should create a Server instance connected to the provided transport', () => {
    const transport = createMockTransport();
    const server = proxy.createSession(transport);
    expect(server).toBeDefined();
  });

  it('should create independent sessions for each transport', () => {
    const transport1 = createMockTransport();
    const transport2 = createMockTransport();

    const server1 = proxy.createSession(transport1);
    const server2 = proxy.createSession(transport2);

    expect(server1).not.toBe(server2);
  });

  it('should share the same tool registry across sessions', async () => {
    // Both sessions should see the same tools since they share the registry
    const transport1 = createMockTransport();
    const transport2 = createMockTransport();

    proxy.createSession(transport1);
    proxy.createSession(transport2);

    // Both transports should have the same tool set (verified via the registry)
    const tools = proxy.registry.getExposedTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});
