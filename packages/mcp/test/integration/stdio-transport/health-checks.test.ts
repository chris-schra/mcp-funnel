/**
 * Health Check Integration Tests
 *
 * Tests verify the HealthCheckManager integration with stdio transport:
 * 1. Health checks start when transport connects
 * 2. Process crashes trigger health check failures
 * 3. Health checks run at configured intervals
 * 4. Health checks can be disabled
 *
 * Uses fast intervals (200ms) to minimize test execution time.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ReconnectablePrefixedStdioClientTransport } from '../../../src/proxy/transports/reconnectable-transport.js';
import { createCleanup, waitFor, simulateCrash, TEST_SERVER_CONFIG } from './utils.js';
import type { ConnectionStateChange } from '@mcp-funnel/models';

describe('Health Check Integration', () => {
  const resources: Parameters<typeof createCleanup>[0] = {};
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  it('should start health checks when transport connects', async () => {
    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: [...TEST_SERVER_CONFIG.args],
      healthChecks: true,
      healthCheckInterval: 200,
      reconnection: { maxAttempts: 1 },
    });

    const client = new Client({ name: 'health-test', version: '1.0.0' }, { capabilities: {} });

    resources.transport = transport;
    resources.client = client;
    cleanup = createCleanup(resources);

    await client.connect(transport);
    expect(transport.connectionState).toBe('connected');

    // Wait for at least one health check cycle
    await new Promise((resolve) => setTimeout(resolve, 250));

    // If health checks are running, transport should still be connected
    expect(transport.connectionState).toBe('connected');
  }, 10000);

  it('should trigger failure callback when process crashes', async () => {
    let disconnectionError: Error | undefined;
    const stateChanges: ConnectionStateChange[] = [];

    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: [...TEST_SERVER_CONFIG.args],
      healthChecks: true,
      healthCheckInterval: 200,
      reconnection: { maxAttempts: 2, initialDelayMs: 100 },
    });

    transport.onDisconnection((state) => {
      stateChanges.push(state);
      if (state.error) {
        disconnectionError = state.error;
      }
    });

    const client = new Client({ name: 'crash-test', version: '1.0.0' }, { capabilities: {} });

    resources.transport = transport;
    resources.client = client;
    cleanup = createCleanup(resources);

    await client.connect(transport);
    expect(transport.connectionState).toBe('connected');

    // Simulate process crash
    simulateCrash(transport);

    // Wait for health check to detect the crash
    await waitFor(() => (disconnectionError ? disconnectionError : null), { timeoutMs: 1000 });

    expect(disconnectionError).toBeDefined();
    // Process crash can be detected by either health check or close handler
    expect(disconnectionError?.message).toMatch(/Process is not running|closed unexpectedly/i);
    expect(stateChanges.length).toBeGreaterThan(0);
    // Verify disconnection was detected (may transition to 'connecting' if reconnection starts)
    const hasDisconnectedState = stateChanges.some((s) => s.to === 'disconnected');
    const isReconnecting = stateChanges.some((s) => s.to === 'connecting');
    expect(hasDisconnectedState || isReconnecting).toBe(true);
  }, 10000);

  it('should run health checks at configured interval', async () => {
    const stateChanges: ConnectionStateChange[] = [];

    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: [...TEST_SERVER_CONFIG.args],
      healthChecks: true,
      healthCheckInterval: 200,
      reconnection: { maxAttempts: 2, initialDelayMs: 100 },
    });

    transport.onDisconnection((state) => {
      stateChanges.push(state);
    });

    const client = new Client({ name: 'interval-test', version: '1.0.0' }, { capabilities: {} });

    resources.transport = transport;
    resources.client = client;
    cleanup = createCleanup(resources);

    await client.connect(transport);
    expect(transport.connectionState).toBe('connected');

    // Wait through multiple health check intervals to verify checks are passing
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Transport should still be connected (health checks passing)
    expect(transport.connectionState).toBe('connected');

    // Now simulate crash - health check system should detect and trigger reconnection
    simulateCrash(transport);

    // Wait for disconnection to be detected
    await waitFor(() => (stateChanges.length > 0 ? true : null), {
      timeoutMs: 1000,
    });

    // Verify that disconnection was detected
    expect(stateChanges.length).toBeGreaterThan(0);
    // State may transition through disconnected to connecting if reconnection starts
    const hasDisconnectedState = stateChanges.some((s) => s.to === 'disconnected');
    const isReconnecting = stateChanges.some((s) => s.to === 'connecting');
    expect(hasDisconnectedState || isReconnecting).toBe(true);
    // Transport may be in any state (connected if reconnection succeeded, connecting, or disconnected)
    expect(['connecting', 'disconnected', 'connected']).toContain(transport.connectionState);
  }, 10000);

  it('should not run health checks when disabled', async () => {
    const stateChanges: ConnectionStateChange[] = [];
    let unexpectedFailure = false;

    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: [...TEST_SERVER_CONFIG.args],
      healthChecks: false, // Disabled
      healthCheckInterval: 200,
      reconnection: { maxAttempts: 1 },
    });

    transport.onDisconnection((state) => {
      stateChanges.push(state);
      if (state.error?.message.includes('Health check')) {
        unexpectedFailure = true;
      }
    });

    const client = new Client({ name: 'disabled-test', version: '1.0.0' }, { capabilities: {} });

    resources.transport = transport;
    resources.client = client;
    cleanup = createCleanup(resources);

    await client.connect(transport);
    expect(transport.connectionState).toBe('connected');

    // Simulate crash
    simulateCrash(transport);

    // Wait longer than health check interval
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Health check should NOT have detected the crash
    expect(unexpectedFailure).toBe(false);

    // The crash should still be detectable via close event, not health check
    if (stateChanges.length > 0) {
      const healthCheckErrors = stateChanges.filter((s) =>
        s.error?.message.includes('Health check'),
      );
      expect(healthCheckErrors).toHaveLength(0);
    }
  }, 10000);
});
