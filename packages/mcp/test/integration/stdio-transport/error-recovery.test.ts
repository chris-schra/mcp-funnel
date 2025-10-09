/**
 * STDIO Transport Error Recovery Tests
 *
 * Coverage: startup failures, connection errors, cleanup on failure.
 * All tests use createCleanup pattern to prevent resource leaks.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ReconnectablePrefixedStdioClientTransport } from '../../../src/proxy/transports/reconnectable-transport.js';
import {
  createCleanup,
  simulateCrash,
  TEST_RECONNECTION_CONFIG,
  waitForReconnection,
} from './utils.js';

describe('STDIO Transport Error Recovery', () => {
  const cleanupFunctions: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanupFunctions.map((cleanup) => cleanup()));
    cleanupFunctions.length = 0;
  });

  describe('Startup Failures', () => {
    it('should handle invalid command gracefully', async () => {
      const resources: Parameters<typeof createCleanup>[0] = {};
      const cleanup = createCleanup(resources);
      cleanupFunctions.push(cleanup);

      const transport = new ReconnectablePrefixedStdioClientTransport('test-invalid', {
        command: 'this-command-does-not-exist',
        args: [],
        reconnection: {
          maxAttempts: 1, // Fail fast for startup errors
          initialDelayMs: 50,
          maxDelayMs: 100,
          backoffMultiplier: 1,
        },
      });
      resources.transport = transport;

      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      resources.client = client;

      // Attempt to connect should fail
      await expect(client.connect(transport)).rejects.toThrow();

      // Verify transport is in failed state
      expect(transport.connectionState).toBe('disconnected');
    }, 5000);

    it('should handle command that exits immediately', async () => {
      const resources: Parameters<typeof createCleanup>[0] = {};
      const cleanup = createCleanup(resources);
      cleanupFunctions.push(cleanup);

      // Command that exits immediately without producing output
      const transport = new ReconnectablePrefixedStdioClientTransport('test-exit', {
        command: 'node',
        args: ['-e', 'process.exit(0)'],
        reconnection: {
          maxAttempts: 1, // Fail fast
          initialDelayMs: 50,
          maxDelayMs: 100,
          backoffMultiplier: 1,
        },
      });
      resources.transport = transport;

      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      resources.client = client;

      // Connection should fail as process exits before initialization
      await expect(client.connect(transport)).rejects.toThrow();

      // Wait a bit for state to settle
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should be in disconnected state
      expect(transport.connectionState).toBe('disconnected');
    }, 5000);
  });

  describe('Connection Errors', () => {
    it('should handle process crash during operation', async () => {
      const resources: Parameters<typeof createCleanup>[0] = {};
      const cleanup = createCleanup(resources);
      cleanupFunctions.push(cleanup);

      // Create a server that responds to initialize but then crashes
      const transport = new ReconnectablePrefixedStdioClientTransport('test-crash', {
        command: 'node',
        args: [
          '-e',
          `const rl=require('readline').createInterface({input:process.stdin,output:null,terminal:false});rl.on('line',l=>{const m=JSON.parse(l);if(m.method==='initialize'){console.log(JSON.stringify({jsonrpc:'2.0',result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'crash-test',version:'1.0.0'}},id:m.id}));setTimeout(()=>process.exit(1),100);}});`,
        ],
        reconnection: TEST_RECONNECTION_CONFIG,
      });
      resources.transport = transport;

      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      resources.client = client;

      // Initial connection should succeed
      await client.connect(transport);
      expect(transport.connectionState).toBe('connected');

      // Wait for crash and reconnection to complete
      await waitForReconnection(transport);

      // Should have successfully reconnected
      expect(transport.connectionState).toBe('connected');
    }, 8000);

    it('should transition through states correctly on simulated crash', async () => {
      const resources: Parameters<typeof createCleanup>[0] = {};
      const cleanup = createCleanup(resources);
      cleanupFunctions.push(cleanup);

      const transport = new ReconnectablePrefixedStdioClientTransport('test-states', {
        command: 'node',
        args: [
          '-e',
          `const rl=require('readline').createInterface({input:process.stdin,output:null,terminal:false});rl.on('line',l=>{const m=JSON.parse(l);if(m.method==='initialize')console.log(JSON.stringify({jsonrpc:'2.0',result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'state-test',version:'1.0.0'}},id:m.id}));});`,
        ],
        reconnection: TEST_RECONNECTION_CONFIG,
      });
      resources.transport = transport;

      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      resources.client = client;

      await client.connect(transport);
      expect(transport.connectionState).toBe('connected');

      // Simulate crash
      simulateCrash(transport);

      // Wait for reconnection to complete
      await waitForReconnection(transport);

      // Should have successfully reconnected
      expect(transport.connectionState).toBe('connected');
    }, 8000);
  });

  describe('Cleanup on Failure', () => {
    it('should properly cleanup resources when connection fails', async () => {
      const resources: Parameters<typeof createCleanup>[0] = {};
      const cleanup = createCleanup(resources);
      cleanupFunctions.push(cleanup);

      const transport = new ReconnectablePrefixedStdioClientTransport('test-cleanup-fail', {
        command: 'invalid-command-xyz',
        args: [],
        reconnection: {
          maxAttempts: 1, // Fail fast
          initialDelayMs: 50,
          maxDelayMs: 100,
          backoffMultiplier: 1,
        },
      });
      resources.transport = transport;

      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      resources.client = client;

      // Connection will fail
      await expect(client.connect(transport)).rejects.toThrow();

      // Cleanup should work without errors
      await expect(cleanup()).resolves.not.toThrow();

      // Second cleanup should be idempotent
      await expect(cleanup()).resolves.not.toThrow();
    }, 5000);
  });
});
