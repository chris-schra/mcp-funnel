/**
 * STDIO Transport Manual Control Tests
 *
 * Integration tests verifying manual control features for reconnection and state management.
 *
 * Coverage:
 * 1. Manual reconnection - Calling reconnect() restores connection after crash
 * 2. Preventing auto-reconnect - close() stops automatic reconnection attempts
 * 3. State change notifications - onDisconnection handlers receive state updates
 * 4. State reset - reconnect() clears retry count for fresh attempts
 *
 * All tests use createCleanup pattern to prevent resource leaks.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ReconnectablePrefixedStdioClientTransport } from '../../../src/proxy/transports/reconnectable-transport.js';
import type { ConnectionStateChange } from '@mcp-funnel/models';
import {
  createCleanup,
  waitForState,
  simulateCrash,
  TEST_SERVER_CONFIG,
  TEST_RECONNECTION_CONFIG,
} from './utils.js';

describe('STDIO Transport Manual Control', () => {
  const cleanupFunctions: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanupFunctions.map((cleanup) => cleanup()));
    cleanupFunctions.length = 0;
  });

  describe('Manual Reconnection', () => {
    it('should successfully reconnect when reconnect() is called after crash', async () => {
      const resources: Parameters<typeof createCleanup>[0] = {};
      const cleanup = createCleanup(resources);
      cleanupFunctions.push(cleanup);

      const transport = new ReconnectablePrefixedStdioClientTransport(
        TEST_SERVER_CONFIG.serverName,
        {
          command: TEST_SERVER_CONFIG.command,
          args: TEST_SERVER_CONFIG.args,
          reconnection: { ...TEST_RECONNECTION_CONFIG, maxAttempts: 0 },
        },
      );
      resources.transport = transport;

      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      resources.client = client;

      // Initial connection
      await client.connect(transport);
      await waitForState(transport, 'connected');

      // Simulate crash - no auto-reconnect due to maxAttempts: 0
      simulateCrash(transport);
      await waitForState(transport, 'disconnected', 3000);

      // Manual reconnect
      await transport.reconnect();
      await waitForState(transport, 'connected');

      expect(transport.connectionState).toBe('connected');
      expect(transport.retryCount).toBe(0);
    });
  });

  describe('Preventing Auto-Reconnect', () => {
    it('should not auto-reconnect after close() is called', async () => {
      const resources: Parameters<typeof createCleanup>[0] = {};
      const cleanup = createCleanup(resources);
      cleanupFunctions.push(cleanup);

      const transport = new ReconnectablePrefixedStdioClientTransport(
        TEST_SERVER_CONFIG.serverName,
        {
          command: TEST_SERVER_CONFIG.command,
          args: TEST_SERVER_CONFIG.args,
          reconnection: TEST_RECONNECTION_CONFIG,
        },
      );
      resources.transport = transport;

      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      resources.client = client;

      // Initial connection
      await client.connect(transport);
      await waitForState(transport, 'connected');

      // Close manually
      await transport.close();

      // Wait to ensure no auto-reconnection attempts
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should remain in disconnected state
      expect(transport.connectionState).toBe('disconnected');
    });
  });

  describe('State Change Notifications', () => {
    it('should receive state updates via onDisconnection handler', async () => {
      const resources: Parameters<typeof createCleanup>[0] = {};
      const cleanup = createCleanup(resources);
      cleanupFunctions.push(cleanup);

      const stateChanges: ConnectionStateChange[] = [];

      const transport = new ReconnectablePrefixedStdioClientTransport(
        TEST_SERVER_CONFIG.serverName,
        {
          command: TEST_SERVER_CONFIG.command,
          args: TEST_SERVER_CONFIG.args,
          reconnection: TEST_RECONNECTION_CONFIG,
        },
      );
      resources.transport = transport;

      // Register state change handler
      transport.onDisconnection((change) => {
        stateChanges.push(change);
      });

      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      resources.client = client;

      // Initial connection
      await client.connect(transport);
      await waitForState(transport, 'connected');

      // Simulate crash to trigger state changes
      simulateCrash(transport);

      // Wait for state transitions
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify we received state change notifications
      expect(stateChanges.length).toBeGreaterThan(0);

      // Check that state changes include expected properties
      const firstChange = stateChanges[0];
      expect(firstChange).toHaveProperty('from');
      expect(firstChange).toHaveProperty('to');
      expect(firstChange).toHaveProperty('retryCount');
      expect(typeof firstChange.retryCount).toBe('number');
    });
  });

  describe('State Reset on Manual Reconnection', () => {
    it('should reset retry count when reconnect() is called', async () => {
      const resources: Parameters<typeof createCleanup>[0] = {};
      const cleanup = createCleanup(resources);
      cleanupFunctions.push(cleanup);

      const transport = new ReconnectablePrefixedStdioClientTransport(
        TEST_SERVER_CONFIG.serverName,
        {
          command: TEST_SERVER_CONFIG.command,
          args: TEST_SERVER_CONFIG.args,
          reconnection: { ...TEST_RECONNECTION_CONFIG, maxAttempts: 1 },
        },
      );
      resources.transport = transport;

      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      resources.client = client;

      // Initial connection
      await client.connect(transport);
      await waitForState(transport, 'connected');

      // Simulate crash - will trigger one auto-reconnect attempt
      simulateCrash(transport);

      // Wait for auto-reconnect to complete (or fail)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Manual reconnect should reset the retry counter
      await transport.reconnect();
      await waitForState(transport, 'connected');

      // Verify retry count is reset
      expect(transport.retryCount).toBe(0);
    });
  });
});
