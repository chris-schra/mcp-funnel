import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startWebServer, type ServerOptions } from '../../../src/index.js';
import type { MCPProxy } from 'mcp-funnel';
import type { AddressInfo } from 'net';
import type { ServerType } from '@hono/node-server';
import { createMockMCPProxy, closeServer } from './test-utils.js';

describe('Environment Variable Support', () => {
  let server: ServerType | null;
  let mcpProxy: MCPProxy;
  let testPort: number;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    mcpProxy = createMockMCPProxy();
    server = null;
    testPort = 0; // Will be set after server starts
    // Backup environment variables
    originalEnv = {};
  });

  afterEach(async () => {
    // Close server
    await closeServer(server);
    server = null;

    // Restore all modified environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should resolve environment variables in bearer tokens', async () => {
    // Set environment variable for test
    originalEnv.TEST_AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;
    process.env.TEST_AUTH_TOKEN = 'env-resolved-auth-token';

    const options: ServerOptions = {
      port: 0, // Use dynamic port allocation
      host: 'localhost',
      inboundAuth: {
        type: 'bearer',
        tokens: ['${TEST_AUTH_TOKEN}', 'static-token'],
      },
    };

    // Start server with auth
    server = await startWebServer(mcpProxy, options);
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Failed to get server port');
    }
    testPort = address.port;

    // Test with environment-resolved token
    const envTokenResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`, {
      headers: {
        Authorization: 'Bearer env-resolved-auth-token',
      },
    });
    expect(envTokenResponse.status).toBe(200);

    // Test with static token
    const staticTokenResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`, {
      headers: {
        Authorization: 'Bearer static-token',
      },
    });
    expect(staticTokenResponse.status).toBe(200);
  });

  it('should fail startup with undefined environment variables', async () => {
    const options: ServerOptions = {
      port: 0, // Use dynamic port allocation
      host: 'localhost',
      inboundAuth: {
        type: 'bearer',
        tokens: ['${UNDEFINED_TOKEN}'],
      },
    };

    // Should throw during server startup
    await expect(startWebServer(mcpProxy, options)).rejects.toThrow(
      "Required environment variable 'UNDEFINED_TOKEN' is not defined",
    );
  });
});
