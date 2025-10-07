import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startWebServer, type ServerOptions } from '../../../src/index.js';
import type { MCPProxy } from 'mcp-funnel';
import type { AddressInfo } from 'net';
import { ServerType } from '@hono/node-server';
import { createMockMCPProxy, closeServer } from './test-utils.js';

describe('Server Authentication Integration - Error Handling', () => {
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

  describe('Error Handling', () => {
    it('should fail startup with invalid auth configuration', async () => {
      const options: ServerOptions = {
        port: 0, // Use dynamic port allocation
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: [],
        },
      };

      // Should throw during server startup
      await expect(startWebServer(mcpProxy, options)).rejects.toThrow(
        'Bearer authentication requires at least one token',
      );
    });

    it('should handle malformed authorization headers gracefully', async () => {
      const options: ServerOptions = {
        port: 0, // Use dynamic port allocation
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: ['valid-token'],
        },
      };

      // Start server with auth
      server = await startWebServer(mcpProxy, options);
      const address = server.address() as AddressInfo | null;
      if (!address) {
        throw new Error('Failed to get server port');
      }
      testPort = address.port;

      // Test with malformed header
      const malformedResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`, {
        headers: {
          Authorization: 'Basic dXNlcjpwYXNz', // Basic auth instead of Bearer
        },
      });

      expect(malformedResponse.status).toBe(401);
      const data = await malformedResponse.json();
      expect(data.message).toBe('Invalid Authorization header format. Expected: Bearer <token>');
    });

    it('should handle authentication errors gracefully on MCP endpoint', async () => {
      const options: ServerOptions = {
        port: 0,
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: ['valid-token'],
        },
      };

      server = await startWebServer(mcpProxy, options);
      const address = server.address() as AddressInfo | null;
      if (!address) {
        throw new Error('Failed to get server port');
      }
      testPort = address.port;

      // Test empty Bearer token (just spaces after Bearer)
      const emptyTokenResponse = await fetch(`http://localhost:${testPort}/api/streamable/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer    ', // Multiple spaces - will be trimmed to empty
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        }),
      });

      expect(emptyTokenResponse.status).toBe(401);
      const emptyTokenData = await emptyTokenResponse.json();
      // The regex matches but the captured group is empty, which then gets trimmed to empty
      // This could result in either "Empty Bearer token" or "Invalid Authorization header format"
      // depending on the exact regex behavior - both indicate auth failure
      expect([
        'Empty Bearer token',
        'Invalid Authorization header format. Expected: Bearer <token>',
      ]).toContain(emptyTokenData.message);

      // Test malformed Bearer header (missing Bearer prefix)
      const malformedResponse = await fetch(`http://localhost:${testPort}/api/streamable/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Token valid-token',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        }),
      });

      expect(malformedResponse.status).toBe(401);
      const malformedData = await malformedResponse.json();
      expect(malformedData.message).toBe(
        'Invalid Authorization header format. Expected: Bearer <token>',
      );

      // Test valid auth should still work (authentication passes)
      const validResponse = await fetch(`http://localhost:${testPort}/api/streamable/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        }),
      });

      // Authentication should pass (not 401), even if MCP layer has issues
      expect(validResponse.status).not.toBe(401);
    });
  });
});
