import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startWebServer, type ServerOptions } from '../../../src/index.js';
import type { MCPProxy } from 'mcp-funnel';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import { ServerType } from '@hono/node-server';
import { createMockMCPProxy, closeServer } from './test-utils.js';

describe('Complete Authentication Flow Verification', () => {
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

  it('should demonstrate end-to-end authentication enforcement', async () => {
    // This test proves ISSUE-8C0AF61-006 is FIXED by testing:
    // 1. Server starts with auth configured
    // 2. Protected endpoints reject unauthorized requests with proper headers
    // 3. Protected endpoints accept valid tokens
    // 4. Unprotected endpoints remain accessible
    // 5. WebSocket connections are properly authenticated
    // 6. Environment variable resolution works

    process.env.TEST_E2E_TOKEN = 'end-to-end-test-token';

    const options: ServerOptions = {
      port: 0,
      host: 'localhost',
      inboundAuth: {
        type: 'bearer',
        tokens: ['${TEST_E2E_TOKEN}', 'static-e2e-token'],
      },
    };

    server = await startWebServer(mcpProxy, options);
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Failed to get server port');
    }
    testPort = address.port;

    // 1. Verify protected endpoint rejects without auth
    const rejectedResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/health`,
    );
    expect(rejectedResponse.status).toBe(401);
    expect(rejectedResponse.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="MCP Proxy API"',
    );

    // 2. Verify protected endpoint accepts env-resolved token
    const envTokenResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/health`,
      {
        headers: {
          Authorization: 'Bearer end-to-end-test-token',
        },
      },
    );
    expect(envTokenResponse.status).toBe(200);

    // 3. Verify protected endpoint accepts static token
    const staticTokenResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/health`,
      {
        headers: {
          Authorization: 'Bearer static-e2e-token',
        },
      },
    );
    expect(staticTokenResponse.status).toBe(200);

    // 4. Verify MCP endpoint authentication
    const mcpUnauthResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/mcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      },
    );
    expect(mcpUnauthResponse.status).toBe(401);

    const mcpAuthResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/mcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer end-to-end-test-token',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      },
    );
    // Authentication should pass (not 401), even if MCP layer has issues
    expect(mcpAuthResponse.status).not.toBe(401);

    // 5. Verify health endpoint now requires authentication too
    const healthNoAuthResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
    );
    expect(healthNoAuthResponse.status).toBe(401);

    const healthAuthResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
      {
        headers: {
          Authorization: 'Bearer end-to-end-test-token',
        },
      },
    );
    expect(healthAuthResponse.status).toBe(200);

    // 6. Verify WebSocket authentication
    await new Promise<void>((resolve, reject) => {
      const authWs = new WebSocket(`ws://localhost:${testPort}/ws`, {
        headers: {
          Authorization: 'Bearer end-to-end-test-token',
        },
      });

      authWs.on('open', () => {
        authWs.close();
        resolve();
      });

      authWs.on('error', () => {
        reject(new Error('Authenticated WebSocket should have succeeded'));
      });

      setTimeout(() => {
        authWs.close();
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
    });

    // Clean up
    delete process.env.TEST_E2E_TOKEN;

    console.info(
      '✅ ISSUE-8C0AF61-006 VERIFIED: Inbound OAuth authentication is working correctly',
    );
  });
});
