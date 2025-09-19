import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startWebServer, type ServerOptions } from '../../src/index.js';
import type { MCPProxy } from 'mcp-funnel';
import { WebSocket } from 'ws';

// Mock MCPProxy for testing
const createMockMCPProxy = (): MCPProxy => ({
  server: {
    connect: vi.fn(),
    sendToolListChanged: vi.fn(),
  },
  clients: new Map(),
  toolDefinitionCache: new Map(),
  toolMapping: new Map(),
  dynamicallyEnabledTools: new Set(),
  config: {
    servers: [],
    hideTools: [],
    exposeTools: [],
    exposeCoreTools: [],
  },
  completeOAuthFlow: vi.fn(),
} as any);

describe('Server Authentication Integration', () => {
  let server: any;
  let mcpProxy: MCPProxy;
  const testPort = 3457; // Use different port for testing

  beforeEach(() => {
    mcpProxy = createMockMCPProxy();
  });

  afterEach(async () => {
    if (server) {
      // Close server if it was started
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      server = null;
    }
  });

  describe('Bearer Token Authentication', () => {
    it('should protect streamable endpoints with bearer auth', async () => {
      const options: ServerOptions = {
        port: testPort,
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: ['test-auth-token-123'],
        },
      };

      // Start server with auth
      await startWebServer(mcpProxy, options);

      // Test authenticated request
      const authResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`, {
        headers: {
          'Authorization': 'Bearer test-auth-token-123',
        },
      });

      expect(authResponse.status).toBe(200);
      const authData = await authResponse.json();
      expect(authData.status).toBe('ok');

      // Test unauthenticated request
      const noAuthResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`);
      expect(noAuthResponse.status).toBe(401);
      const noAuthData = await noAuthResponse.json();
      expect(noAuthData.error).toBe('Unauthorized');
      expect(noAuthResponse.headers.get('WWW-Authenticate')).toBe('Bearer realm="MCP Proxy API"');

      // Test invalid token
      const invalidAuthResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`, {
        headers: {
          'Authorization': 'Bearer invalid-token',
        },
      });
      expect(invalidAuthResponse.status).toBe(401);
    });

    it('should protect WebSocket connections with bearer auth', async () => {
      const options: ServerOptions = {
        port: testPort,
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: ['test-ws-token-456'],
        },
      };

      // Start server with auth
      await startWebServer(mcpProxy, options);

      // Test authenticated WebSocket connection
      await new Promise<void>((resolve, reject) => {
        const authWs = new WebSocket(`ws://localhost:${testPort}/ws`, {
          headers: {
            'Authorization': 'Bearer test-ws-token-456',
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
          reject(new Error('Unauthenticated WebSocket connection should have failed'));
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

    it('should allow unprotected endpoints without auth', async () => {
      const options: ServerOptions = {
        port: testPort,
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: ['test-token'],
        },
      };

      // Start server with auth
      await startWebServer(mcpProxy, options);

      // Health endpoint should be unprotected
      const healthResponse = await fetch(`http://localhost:${testPort}/api/health`);
      expect(healthResponse.status).toBe(200);
      const healthData = await healthResponse.json();
      expect(healthData.status).toBe('ok');

      // OAuth callback should be unprotected
      const oauthResponse = await fetch(`http://localhost:${testPort}/api/oauth/callback?error=access_denied`);
      expect(oauthResponse.status).toBe(400); // Expected error response, but not auth-related
    });
  });

  describe('No Authentication', () => {
    it('should allow all requests when no auth is configured', async () => {
      const options: ServerOptions = {
        port: testPort,
        host: 'localhost',
        // No inboundAuth configured
      };

      // Start server without auth
      await startWebServer(mcpProxy, options);

      // All endpoints should be accessible
      const streamableResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`);
      expect(streamableResponse.status).toBe(200);

      const healthResponse = await fetch(`http://localhost:${testPort}/api/health`);
      expect(healthResponse.status).toBe(200);

      // WebSocket connections should work without auth
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
    });

    it('should allow all requests with explicit no-auth config', async () => {
      const options: ServerOptions = {
        port: testPort,
        host: 'localhost',
        inboundAuth: {
          type: 'none',
        },
      };

      // Start server with explicit no-auth
      await startWebServer(mcpProxy, options);

      // All endpoints should be accessible
      const streamableResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`);
      expect(streamableResponse.status).toBe(200);

      const healthResponse = await fetch(`http://localhost:${testPort}/api/health`);
      expect(healthResponse.status).toBe(200);
    });
  });

  describe('Environment Variable Support', () => {
    it('should resolve environment variables in bearer tokens', async () => {
      // Set environment variable for test
      process.env.TEST_AUTH_TOKEN = 'env-resolved-auth-token';

      const options: ServerOptions = {
        port: testPort,
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: ['${TEST_AUTH_TOKEN}', 'static-token'],
        },
      };

      // Start server with auth
      await startWebServer(mcpProxy, options);

      // Test with environment-resolved token
      const envTokenResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`, {
        headers: {
          'Authorization': 'Bearer env-resolved-auth-token',
        },
      });
      expect(envTokenResponse.status).toBe(200);

      // Test with static token
      const staticTokenResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`, {
        headers: {
          'Authorization': 'Bearer static-token',
        },
      });
      expect(staticTokenResponse.status).toBe(200);

      // Clean up
      delete process.env.TEST_AUTH_TOKEN;
    });

    it('should fail startup with undefined environment variables', async () => {
      const options: ServerOptions = {
        port: testPort,
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: ['${UNDEFINED_TOKEN}'],
        },
      };

      // Should throw during server startup
      await expect(startWebServer(mcpProxy, options)).rejects.toThrow('Environment variable UNDEFINED_TOKEN is not defined');
    });
  });

  describe('Error Handling', () => {
    it('should fail startup with invalid auth configuration', async () => {
      const options: ServerOptions = {
        port: testPort,
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: [],
        },
      };

      // Should throw during server startup
      await expect(startWebServer(mcpProxy, options)).rejects.toThrow('Bearer authentication requires at least one token');
    });

    it('should handle malformed authorization headers gracefully', async () => {
      const options: ServerOptions = {
        port: testPort,
        host: 'localhost',
        inboundAuth: {
          type: 'bearer',
          tokens: ['valid-token'],
        },
      };

      // Start server with auth
      await startWebServer(mcpProxy, options);

      // Test with malformed header
      const malformedResponse = await fetch(`http://localhost:${testPort}/api/streamable/health`, {
        headers: {
          'Authorization': 'Basic dXNlcjpwYXNz', // Basic auth instead of Bearer
        },
      });

      expect(malformedResponse.status).toBe(401);
      const data = await malformedResponse.json();
      expect(data.message).toBe('Invalid Authorization header format. Expected: Bearer <token>');
    });
  });
});