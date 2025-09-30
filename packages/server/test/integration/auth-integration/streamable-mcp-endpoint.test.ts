import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startWebServer, type ServerOptions } from '../../../src/index.js';
import type { MCPProxy } from 'mcp-funnel';
import type { AddressInfo } from 'net';
import { ServerType } from '@hono/node-server';
import { createMockMCPProxy, closeServer } from './test-utils.js';

describe('Streamable MCP Endpoint Authentication', () => {
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

  it('should protect /api/streamable/mcp endpoint with bearer auth', async () => {
    const options: ServerOptions = {
      port: 0, // Use dynamic port allocation
      host: 'localhost',
      inboundAuth: {
        type: 'bearer',
        tokens: ['test-mcp-token-123'],
      },
    };

    // Start server with auth
    server = await startWebServer(mcpProxy, options);
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Failed to get server port');
    }
    testPort = address.port;

    // Note: The authentication passes to the MCP layer but the MCP SDK has issues
    // with Hono's response object. The important part is that auth enforcement works.

    // Test authenticated MCP JSON-RPC request (POST) - auth should pass
    const authJsonRpcResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/mcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-mcp-token-123',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        }),
      },
    );

    // Authentication passed (not 401), even if MCP layer has issues
    expect(authJsonRpcResponse.status).not.toBe(401);

    // Test authenticated SSE stream (GET) - auth should pass
    const authSseResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/mcp`,
      {
        headers: {
          Accept: 'text/event-stream',
          Authorization: 'Bearer test-mcp-token-123',
        },
      },
    );

    // Authentication passed (not 401), even if MCP layer has issues
    expect(authSseResponse.status).not.toBe(401);

    // Test unauthenticated MCP request
    const noAuthResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/mcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        }),
      },
    );

    expect(noAuthResponse.status).toBe(401);
    const noAuthData = await noAuthResponse.json();
    expect(noAuthData.error).toBe('Unauthorized');
    expect(noAuthResponse.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="MCP Proxy API"',
    );

    // Test unauthenticated SSE request
    const noAuthSseResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/mcp`,
      {
        headers: {
          Accept: 'text/event-stream',
        },
      },
    );

    expect(noAuthSseResponse.status).toBe(401);
    expect(noAuthSseResponse.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="MCP Proxy API"',
    );

    // Test invalid token on MCP endpoint
    const invalidAuthResponse = await fetch(
      `http://localhost:${testPort}/api/streamable/mcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-mcp-token',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        }),
      },
    );

    expect(invalidAuthResponse.status).toBe(401);
    const invalidAuthData = await invalidAuthResponse.json();
    expect(invalidAuthData.error).toBe('Unauthorized');
    expect(invalidAuthResponse.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="MCP Proxy API"',
    );
  });

  it('should protect all HTTP methods on streamable MCP endpoint', async () => {
    const options: ServerOptions = {
      port: 0,
      host: 'localhost',
      inboundAuth: {
        type: 'bearer',
        tokens: ['test-methods-token'],
      },
    };

    server = await startWebServer(mcpProxy, options);
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Failed to get server port');
    }
    testPort = address.port;

    const methods = ['GET', 'POST', 'DELETE'] as const;
    const baseUrl = `http://localhost:${testPort}/api/streamable/mcp`;

    // Test all methods with valid auth
    for (const method of methods) {
      const authResponse = await fetch(baseUrl, {
        method,
        headers: {
          Authorization: 'Bearer test-methods-token',
          'Content-Type': 'application/json',
          Accept: method === 'GET' ? 'text/event-stream' : 'application/json',
        },
        body:
          method === 'POST'
            ? JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
            : undefined,
      });

      // Authentication should pass (not 401), even if MCP layer has issues
      expect(authResponse.status).not.toBe(401);
    }

    // Test all methods without auth
    for (const method of methods) {
      const noAuthResponse = await fetch(baseUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: method === 'GET' ? 'text/event-stream' : 'application/json',
        },
        body:
          method === 'POST'
            ? JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
            : undefined,
      });

      // All should fail (401) when not authenticated
      expect(noAuthResponse.status).toBe(401);
      expect(noAuthResponse.headers.get('WWW-Authenticate')).toBe(
        'Bearer realm="MCP Proxy API"',
      );
    }
  });
});
