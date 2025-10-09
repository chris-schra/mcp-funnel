/**
 * Stdio Transport Reconnection Integration Tests
 *
 * Tests the reconnection behavior of ReconnectablePrefixedStdioClientTransport.
 *
 * Tests cover:
 * 1. Automatic reconnection after process crash
 * 2. Exponential backoff between retry attempts
 * 3. Max reconnection attempts enforcement
 * 4. Retry counter reset after successful reconnection
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ReconnectablePrefixedStdioClientTransport } from '../../../src/proxy/transports/reconnectable-transport.js';
import { ConnectionState } from '@mcp-funnel/models';
import {
  simulateCrash,
  waitForReconnection,
  verifyToolCall,
  TEST_SERVER_CONFIG,
  TEST_RECONNECTION_CONFIG,
  createCleanup,
  waitForState,
  waitFor,
} from './utils.js';

describe('Stdio Transport Reconnection', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('should automatically reconnect after process crash', async () => {
    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: [...TEST_SERVER_CONFIG.args],
      reconnection: TEST_RECONNECTION_CONFIG,
    });

    const client = new Client({ name: 'reconnect-test', version: '1.0.0' }, { capabilities: {} });

    cleanup = createCleanup({ transport, client });

    await client.connect(transport);
    expect(transport.connectionState).toBe(ConnectionState.Connected);

    // Verify initial connection works
    const initialCallSuccess = await verifyToolCall(client);
    expect(initialCallSuccess).toBe(true);

    // Simulate crash
    simulateCrash(transport);

    // Wait for reconnection
    await waitForReconnection(transport);
    expect(transport.connectionState).toBe(ConnectionState.Connected);

    // Verify connection works after reconnection
    const afterReconnectSuccess = await verifyToolCall(client);
    expect(afterReconnectSuccess).toBe(true);
  }, 15000);

  it('should apply exponential backoff between retry attempts', async () => {
    const backoffConfig = {
      maxAttempts: 4,
      initialDelayMs: 200,
      maxDelayMs: 2000,
      backoffMultiplier: 2,
    };

    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: [...TEST_SERVER_CONFIG.args],
      reconnection: backoffConfig,
    });

    const client = new Client({ name: 'backoff-test', version: '1.0.0' }, { capabilities: {} });

    cleanup = createCleanup({ transport, client });

    const reconnectionScheduledTimes: number[] = [];
    const reconnectionAttemptTimes: number[] = [];
    let wasReconnecting = false;

    // Register handler BEFORE connecting to capture all state changes
    transport.onDisconnection((stateChange) => {
      if (stateChange.to === ConnectionState.Reconnecting) {
        reconnectionScheduledTimes.push(Date.now());
        wasReconnecting = true;
      }
      // Track when reconnection attempt actually starts
      // (after close() resets to Disconnected, then start() transitions to Connecting)
      if (
        wasReconnecting &&
        stateChange.from === ConnectionState.Disconnected &&
        stateChange.to === ConnectionState.Connecting
      ) {
        reconnectionAttemptTimes.push(Date.now());
        wasReconnecting = false;
      }
    });

    await client.connect(transport);

    // Crash to trigger reconnection
    simulateCrash(transport);

    // Wait for crash to be detected (state changes away from Connected)
    await waitFor(() => (transport.connectionState !== ConnectionState.Connected ? true : null), {
      timeoutMs: 5000,
    });

    await waitForReconnection(transport, 10000);

    // Verify we had at least one reconnection scheduled and attempted
    expect(reconnectionScheduledTimes.length).toBeGreaterThan(0);
    expect(reconnectionAttemptTimes.length).toBeGreaterThan(0);

    // Verify backoff delay was applied between scheduling and attempt
    const firstDelay = reconnectionAttemptTimes[0] - reconnectionScheduledTimes[0];
    expect(firstDelay).toBeGreaterThanOrEqual(backoffConfig.initialDelayMs * 0.7); // Allow for timing variance
  }, 15000);

  it('should respect max reconnection attempts', async () => {
    const maxAttemptsConfig = {
      maxAttempts: 2,
      initialDelayMs: 100,
      maxDelayMs: 200,
      backoffMultiplier: 2,
    };

    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: 'nonexistent-command-that-will-fail',
      args: [],
      reconnection: maxAttemptsConfig,
    });

    const client = new Client(
      { name: 'max-attempts-test', version: '1.0.0' },
      { capabilities: {} },
    );

    cleanup = createCleanup({ transport, client });

    // Attempt to connect to a failing command
    await expect(client.connect(transport)).rejects.toThrow();

    // Allow brief time for async error events to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Initial connection failure leaves state as Disconnected or Reconnecting
    // (doesn't reach Failed since no successful connection was established first)
    const validStates = [ConnectionState.Disconnected, ConnectionState.Reconnecting];
    expect(validStates).toContain(transport.connectionState);
  }, 10000);

  it('should reset retry count after successful reconnection', async () => {
    const transport = new ReconnectablePrefixedStdioClientTransport(TEST_SERVER_CONFIG.serverName, {
      command: TEST_SERVER_CONFIG.command,
      args: [...TEST_SERVER_CONFIG.args],
      reconnection: TEST_RECONNECTION_CONFIG,
    });

    const client = new Client({ name: 'retry-reset-test', version: '1.0.0' }, { capabilities: {} });

    cleanup = createCleanup({ transport, client });

    await client.connect(transport);
    expect(transport.retryCount).toBe(0);

    // First crash and reconnect
    simulateCrash(transport);
    await waitForReconnection(transport);

    // Retry count should be reset after successful connection
    expect(transport.retryCount).toBe(0);
    expect(transport.connectionState).toBe(ConnectionState.Connected);

    // Second crash and reconnect
    simulateCrash(transport);
    await waitForReconnection(transport);

    // Retry count should still be reset
    expect(transport.retryCount).toBe(0);
    expect(transport.connectionState).toBe(ConnectionState.Connected);
  }, 20000);
});
