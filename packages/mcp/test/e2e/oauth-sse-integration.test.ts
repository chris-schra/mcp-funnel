/**
 * End-to-End OAuth + SSE Integration Tests
 *
 * Tests OAuth authentication integrated with SSE transport using OAuth2ClientCredentialsProvider
 * which doesn't require human interaction, making it suitable for automated testing.
 *
 * Tests integration aspects:
 * 1. OAuth token acquisition and usage
 * 2. Token refresh during active connection
 * 3. 401 handling and retry
 * 4. Connection recovery with auth
 * 5. Multiple concurrent authenticated connections
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../src/auth/implementations/oauth2-client-credentials.js';
import { MemoryTokenStorage } from '../../src/auth/implementations/memory-token-storage.js';
import { SSEClientTransport } from '../../src/transports/implementations/sse-client-transport.js';
import {
  MockSSEServer,
  createMockSSEServer,
} from '../mocks/mock-sse-server.js';
import type {
  JSONRPCResponse,
  JSONRPCRequest,
} from '@modelcontextprotocol/sdk/types.js';

// Mock EventSource globally - must be before SSE imports
vi.mock('eventsource', () => {
  const { MockEventSource } = vi.importActual('../mocks/mock-eventsource.js') as typeof import('../mocks/mock-eventsource.js');
  return {
    EventSource: MockEventSource,
  };
});

// Mock fetch for HTTP requests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/**
 * Mock OAuth2 server for client credentials flow
 */
class MockOAuthServer {
  public authToken = 'mock-access-token-12345';
  public tokenExpiry = Date.now() + 3600000; // 1 hour
  public shouldFailAuth = false;
  public tokenRefreshCount = 0;

  setupMockResponses(): void {
    mockFetch.mockImplementation(async (url: string, options: RequestInit = {}) => {
      const urlObj = new URL(url);

      // Token endpoint for client credentials
      if (urlObj.pathname === '/oauth/token') {
        if (this.shouldFailAuth) {
          return new Response(
            JSON.stringify({
              error: 'invalid_client',
              error_description: 'Invalid client credentials'
            }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        this.tokenRefreshCount++;

        return new Response(
          JSON.stringify({
            access_token: this.authToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'read write',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // SSE endpoint with auth check
      if (urlObj.pathname.includes('/sse')) {
        const authHeader = (options.headers as Record<string, string>)?.['Authorization'];
        if (!authHeader || !authHeader.includes(this.authToken)) {
          return new Response('Unauthorized', { status: 401 });
        }
        return new Response('OK', { status: 200 });
      }

      return new Response('Not Found', { status: 404 });
    });
  }

  expireToken(): void {
    this.authToken = 'expired-token-' + Date.now();
  }

  reset(): void {
    this.authToken = 'mock-access-token-12345';
    this.shouldFailAuth = false;
    this.tokenRefreshCount = 0;
  }
}

describe('OAuth + SSE Integration E2E Tests', () => {
  let mockSSEServer: MockSSEServer;
  let mockOAuthServer: MockOAuthServer;
  let serverInfo: { url: string; port: number };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Start mock SSE server
    const serverResult = await createMockSSEServer({
      requireAuth: true,
      authToken: 'mock-access-token-12345',
    });
    mockSSEServer = serverResult.server;
    serverInfo = { url: serverResult.url, port: serverResult.port };

    // Setup mock OAuth server
    mockOAuthServer = new MockOAuthServer();
    mockOAuthServer.setupMockResponses();
  });

  afterEach(async () => {
    await mockSSEServer?.stop();
    vi.resetAllMocks();
  });

  describe('OAuth2 Client Credentials with SSE Transport', () => {
    it('should acquire token and establish SSE connection', async () => {
      const tokenStorage = new MemoryTokenStorage();

      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          tokenEndpoint: `${serverInfo.url}/oauth/token`,
          scope: 'read write',
        },
        tokenStorage
      );

      // Create transport with auth
      const transport = new SSEClientTransport({
        url: `${serverInfo.url}/sse`,
        authProvider: {
          async getAuthHeaders() {
            return await authProvider.getHeaders();
          },
          async refreshToken() {
            await authProvider.refresh();
          },
        },
      });

      // Start transport - should acquire token automatically
      await transport.start();

      // Verify token was acquired
      expect(mockOAuthServer.tokenRefreshCount).toBe(1);
      const storedToken = await tokenStorage.retrieve();
      expect(storedToken).toBeDefined();
      expect(storedToken?.accessToken).toBe('mock-access-token-12345');

      await transport.close();
    }, 10000);

    it('should handle 401 and refresh token', async () => {
      const tokenStorage = new MemoryTokenStorage();

      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          tokenEndpoint: `${serverInfo.url}/oauth/token`,
        },
        tokenStorage
      );

      const transport = new SSEClientTransport({
        url: `${serverInfo.url}/sse`,
        authProvider: {
          async getAuthHeaders() {
            return await authProvider.getHeaders();
          },
          async refreshToken() {
            await authProvider.refresh();
          },
        },
      });

      await transport.start();

      // Expire the token to trigger 401
      mockOAuthServer.expireToken();

      // Send a message that should trigger 401 and retry
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
        params: {},
      };

      // This should trigger token refresh
      try {
        await transport.send(request);
      } catch {
        // Expected to fail but should have attempted refresh
      }

      // Should have refreshed token
      expect(mockOAuthServer.tokenRefreshCount).toBeGreaterThan(1);

      await transport.close();
    }, 10000);

    it('should handle authentication failures gracefully', async () => {
      const tokenStorage = new MemoryTokenStorage();
      mockOAuthServer.shouldFailAuth = true;

      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'invalid-client',
          clientSecret: 'invalid-secret',
          tokenEndpoint: `${serverInfo.url}/oauth/token`,
        },
        tokenStorage
      );

      // Trying to get headers should fail with auth error
      let authError: Error | undefined;
      try {
        await authProvider.getHeaders();
      } catch (error) {
        authError = error as Error;
      }

      expect(authError).toBeDefined();
      expect(authError?.message).toContain('OAuth2 authentication failed');

      // No token should be stored
      const storedToken = await tokenStorage.retrieve();
      expect(storedToken).toBeNull();
    }, 10000);

    it('should support multiple concurrent authenticated connections', async () => {
      const transports: SSEClientTransport[] = [];

      // Create multiple transports with same auth provider
      const tokenStorage = new MemoryTokenStorage();
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          tokenEndpoint: `${serverInfo.url}/oauth/token`,
        },
        tokenStorage
      );

      for (let i = 0; i < 3; i++) {
        const transport = new SSEClientTransport({
          url: `${serverInfo.url}/sse`,
          authProvider: {
            async getAuthHeaders() {
              return await authProvider.getHeaders();
            },
            async refreshToken() {
              await authProvider.refresh();
            },
          },
        });
        transports.push(transport);
      }

      // Start all transports concurrently
      await Promise.all(transports.map(t => t.start()));

      // Should reuse same token for all connections
      expect(mockOAuthServer.tokenRefreshCount).toBe(1);

      // Clean up
      await Promise.all(transports.map(t => t.close()));
    }, 10000);

    it('should handle token expiry during active connection', async () => {
      const tokenStorage = new MemoryTokenStorage();

      // Create provider with short expiry
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          tokenEndpoint: `${serverInfo.url}/oauth/token`,
        },
        tokenStorage
      );

      const transport = new SSEClientTransport({
        url: `${serverInfo.url}/sse`,
        authProvider: {
          async getAuthHeaders() {
            return await authProvider.getHeaders();
          },
          async refreshToken() {
            await authProvider.refresh();
          },
        },
      });

      await transport.start();
      const initialRefreshCount = mockOAuthServer.tokenRefreshCount;

      // Store token with short expiry
      await tokenStorage.store({
        accessToken: 'soon-to-expire',
        expiresAt: new Date(Date.now() + 1000), // Expires in 1 second
        tokenType: 'Bearer',
      });

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Next request should trigger refresh
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: '2',
        method: 'test',
        params: {},
      };

      try {
        await transport.send(request);
      } catch {
        // Expected to fail but should have refreshed
      }

      expect(mockOAuthServer.tokenRefreshCount).toBeGreaterThan(initialRefreshCount);

      await transport.close();
    }, 10000);
  });
});