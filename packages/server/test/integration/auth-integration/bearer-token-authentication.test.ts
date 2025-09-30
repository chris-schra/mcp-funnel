import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startWebServer, type ServerOptions } from '../../../src/index.js';
import type { MCPProxy } from 'mcp-funnel';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import { ServerType } from '@hono/node-server';
import { createMockMCPProxy, closeServer } from './test-utils.js';

describe('Bearer Token Authentication', () => {
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

  it('should protect streamable endpoints with bearer auth', async () => {
    const options: ServerOptions = {
      port: 0, // Use dynamic port allocation
      host: 'localhost',
      inboundAuth: {
        type: 'bearer',
        tokens: ['test-auth-token-123'],
      },
    };

    // Start server with auth
    server = await startWebServer(mcpProxy, options);
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Failed to get server port');
    }
    testPort = address.port;

    // Test authenticated request
    const authResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/health`,
      {
        headers: {
          Authorization: 'Bearer test-auth-token-123',
        },
      },
    );

    expect(authResponse.status).toBe(200);
    const authData = await authResponse.json();
    expect(authData.status).toBe('ok');

    // Test unauthenticated request
    const noAuthResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/health`,
    );
    expect(noAuthResponse.status).toBe(401);
    const noAuthData = await noAuthResponse.json();
    expect(noAuthData.error).toBe('Unauthorized');
    expect(noAuthResponse.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="MCP Proxy API"',
    );

    // Test invalid token
    const invalidAuthResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/health`,
      {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      },
    );
    expect(invalidAuthResponse.status).toBe(401);
  });

  it('should protect WebSocket connections with bearer auth', async () => {
    const options: ServerOptions = {
      port: 0, // Use dynamic port allocation
      host: 'localhost',
      inboundAuth: {
        type: 'bearer',
        tokens: ['test-ws-token-456'],
      },
    };

    // Start server with auth
    server = await startWebServer(mcpProxy, options);
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Failed to get server port');
    }
    testPort = address.port;

    // Test authenticated WebSocket connection
    await new Promise<void>((resolve, reject) => {
      const authWs = new WebSocket(`ws://localhost:${testPort}/ws`, {
        headers: {
          Authorization: 'Bearer test-ws-token-456',
        },
      });

      authWs.on('open', () => {
        authWs.close();
        resolve();
      });

      authWs.on('error', () => {
        reject(new Error('Authenticated WebSocket connection failed'));
      });

      // Timeout the test if connection doesn't succeed
      setTimeout(() => {
        authWs.close();
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
    });

    // Test unauthenticated WebSocket connection
    await new Promise<void>((resolve, reject) => {
      const noAuthWs = new WebSocket(`ws://localhost:${testPort}/ws`);

      noAuthWs.on('open', () => {
        noAuthWs.close();
        reject(
          new Error('Unauthenticated WebSocket connection should have failed'),
        );
      });

      noAuthWs.on('error', () => {
        // Expected to fail
        resolve();
      });

      // Timeout and resolve as success (expected failure)
      setTimeout(() => {
        noAuthWs.close();
        resolve();
      }, 2000);
    });
  });

  it('should now protect all API endpoints including health with auth', async () => {
    const options: ServerOptions = {
      port: 0, // Use dynamic port allocation
      host: 'localhost',
      inboundAuth: {
        type: 'bearer',
        tokens: ['test-token'],
      },
    };

    // Start server with auth
    server = await startWebServer(mcpProxy, options);
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Failed to get server port');
    }
    testPort = address.port;

    // Health endpoint now requires auth for security
    const healthNoAuthResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
    );
    expect(healthNoAuthResponse.status).toBe(401);

    const healthAuthResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
      {
        headers: {
          Authorization: 'Bearer test-token',
        },
      },
    );
    expect(healthAuthResponse.status).toBe(200);
    const healthData = await healthAuthResponse.json();
    expect(healthData.status).toBe('ok');
    expect(healthData.authenticated).toBe(true);

    // OAuth endpoints also now require auth
    const oauthNoAuthResponse = await fetch(
      `http://localhost:${testPort}/api/oauth/callback?error=access_denied`,
    );
    expect(oauthNoAuthResponse.status).toBe(401);

    const oauthAuthResponse = await fetch(
      `http://localhost:${testPort}/api/oauth/callback?error=access_denied`,
      {
        headers: {
          Authorization: 'Bearer test-token',
        },
      },
    );
    expect(oauthAuthResponse.status).toBe(400); // Expected error response, but not auth-related
  });
});
