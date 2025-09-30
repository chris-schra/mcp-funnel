import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startWebServer, type ServerOptions } from '../../../src/index.js';
import type { MCPProxy } from 'mcp-funnel';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import { ServerType } from '@hono/node-server';
import { createMockMCPProxy, closeServer } from './test-utils.js';

describe('Mandatory Authentication (Security Fix)', () => {
  let server: ServerType | null;
  let mcpProxy: MCPProxy;
  let testPort: number;

  beforeEach(() => {
    mcpProxy = createMockMCPProxy();
    server = null;
    testPort = 0; // Will be set after server starts
  });

  afterEach(async () => {
    await closeServer(server);
    server = null;
  });

  it('should REFUSE to start when no auth is configured (SECURITY FIX)', async () => {
    const options: ServerOptions = {
      port: 0, // Use dynamic port allocation
      host: 'localhost',
      // No inboundAuth configured - this should now FAIL
    };

    // Server should refuse to start without auth for security
    await expect(startWebServer(mcpProxy, options)).rejects.toThrow(
      'Inbound authentication is mandatory. Provide auth config or set DISABLE_INBOUND_AUTH=true.',
    );
  });

  it('should allow opt-out via DISABLE_INBOUND_AUTH environment variable', async () => {
    // Test the explicit opt-out mechanism for development/testing
    const originalEnv = process.env.DISABLE_INBOUND_AUTH;
    process.env.DISABLE_INBOUND_AUTH = 'true';

    try {
      const options: ServerOptions = {
        port: 0,
        host: 'localhost',
        inboundAuth: {
          type: 'none',
        },
      };

      // Server should start with explicit no-auth config
      server = await startWebServer(mcpProxy, options);
      const address = server.address() as AddressInfo | null;
      if (!address) {
        throw new Error('Failed to get server port');
      }
      testPort = address.port;

      // All endpoints should be accessible when auth is explicitly disabled
      const streamableResponse = await fetch(
        `http://localhost:${testPort}/api/streamable/health`,
      );
      expect(streamableResponse.status).toBe(200);

      const healthResponse = await fetch(
        `http://localhost:${testPort}/api/health`,
      );
      expect(healthResponse.status).toBe(200);

      // WebSocket connections should work without auth when disabled
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${testPort}/ws`);

        ws.on('open', () => {
          ws.close();
          resolve();
        });

        ws.on('error', (error) => {
          reject(new Error(`WebSocket connection failed: ${error.message}`));
        });

        setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }, 5000);
      });
    } finally {
      // Restore original environment
      if (originalEnv !== undefined) {
        process.env.DISABLE_INBOUND_AUTH = originalEnv;
      } else {
        delete process.env.DISABLE_INBOUND_AUTH;
      }
    }
  });

  it('should allow all requests with explicit no-auth config', async () => {
    const options: ServerOptions = {
      port: 0, // Use dynamic port allocation
      host: 'localhost',
      inboundAuth: {
        type: 'none',
      },
    };

    // Start server with explicit no-auth
    server = await startWebServer(mcpProxy, options);
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Failed to get server port');
    }
    testPort = address.port;

    // All endpoints should be accessible
    const streamableResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/health`,
    );
    expect(streamableResponse.status).toBe(200);

    const healthResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
    );
    expect(healthResponse.status).toBe(200);
  });
});
