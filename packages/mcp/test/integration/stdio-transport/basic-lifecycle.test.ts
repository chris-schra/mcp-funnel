import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ReconnectablePrefixedStdioClientTransport } from '../../../src/proxy/transports/reconnectable-transport.js';
import {
  createCleanup,
  TEST_SERVER_CONFIG,
  TEST_RECONNECTION_CONFIG,
  verifyToolCall,
  listServerTools,
  waitForState,
  type TransportTestResources,
} from './utils.js';

describe('Basic StdioClientTransport Lifecycle', () => {
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  it('should spawn server and establish connection', async () => {
    const resources: TransportTestResources = {};

    const transport = new StdioClientTransport({
      command: TEST_SERVER_CONFIG.command,
      args: TEST_SERVER_CONFIG.args,
    });
    resources.transport = transport as unknown as ReconnectablePrefixedStdioClientTransport;

    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    resources.client = client;

    cleanup = createCleanup(resources);

    await client.connect(transport);

    // Connection established successfully if no error thrown
    expect(client).toBeDefined();
  });

  it('should list tools from mcp-server-time', async () => {
    const resources: TransportTestResources = {};

    const transport = new StdioClientTransport({
      command: TEST_SERVER_CONFIG.command,
      args: TEST_SERVER_CONFIG.args,
    });
    resources.transport = transport as unknown as ReconnectablePrefixedStdioClientTransport;

    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    resources.client = client;

    cleanup = createCleanup(resources);

    await client.connect(transport);

    const tools = await listServerTools(client);

    expect(tools).toContain('get_current_time');
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should successfully call get_current_time tool', async () => {
    const resources: TransportTestResources = {};

    const transport = new StdioClientTransport({
      command: TEST_SERVER_CONFIG.command,
      args: TEST_SERVER_CONFIG.args,
    });
    resources.transport = transport as unknown as ReconnectablePrefixedStdioClientTransport;

    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    resources.client = client;

    cleanup = createCleanup(resources);

    await client.connect(transport);

    const success = await verifyToolCall(client);

    expect(success).toBe(true);
  });

  it('should gracefully disconnect and clean up resources', async () => {
    const resources: TransportTestResources = {};

    const transport = new StdioClientTransport({
      command: TEST_SERVER_CONFIG.command,
      args: TEST_SERVER_CONFIG.args,
    });
    resources.transport = transport as unknown as ReconnectablePrefixedStdioClientTransport;

    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    resources.client = client;

    cleanup = createCleanup(resources);

    await client.connect(transport);

    // Cleanup should not throw
    await cleanup();

    // Calling cleanup again should be idempotent
    await cleanup();

    expect(true).toBe(true); // Test passes if no errors
  });
});

describe('ReconnectablePrefixedStdioClientTransport Lifecycle', () => {
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  it('should spawn server and establish connection', async () => {
    const resources: TransportTestResources = {};

    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: TEST_SERVER_CONFIG.args,
      reconnection: TEST_RECONNECTION_CONFIG,
    });
    resources.transport = transport;

    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    resources.client = client;

    cleanup = createCleanup(resources);

    await client.connect(transport);

    await waitForState(transport, 'connected');

    expect(transport.connectionState).toBe('connected');
  });

  it('should list tools from mcp-server-time', async () => {
    const resources: TransportTestResources = {};

    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: TEST_SERVER_CONFIG.args,
      reconnection: TEST_RECONNECTION_CONFIG,
    });
    resources.transport = transport;

    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    resources.client = client;

    cleanup = createCleanup(resources);

    await client.connect(transport);
    await waitForState(transport, 'connected');

    const tools = await listServerTools(client);

    expect(tools).toContain('get_current_time');
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should successfully call get_current_time tool', async () => {
    const resources: TransportTestResources = {};

    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: TEST_SERVER_CONFIG.args,
      reconnection: TEST_RECONNECTION_CONFIG,
    });
    resources.transport = transport;

    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    resources.client = client;

    cleanup = createCleanup(resources);

    await client.connect(transport);
    await waitForState(transport, 'connected');

    const success = await verifyToolCall(client);

    expect(success).toBe(true);
  });

  it('should gracefully disconnect and clean up resources', async () => {
    const resources: TransportTestResources = {};

    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: TEST_SERVER_CONFIG.args,
      reconnection: TEST_RECONNECTION_CONFIG,
    });
    resources.transport = transport;

    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    resources.client = client;

    cleanup = createCleanup(resources);

    await client.connect(transport);
    await waitForState(transport, 'connected');

    // Cleanup should not throw
    await cleanup();

    // Calling cleanup again should be idempotent
    await cleanup();

    expect(true).toBe(true); // Test passes if no errors
  });
});
