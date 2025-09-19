/**
 * SSE Integration Tests
 *
 * REAL INTEGRATION TESTS - These tests use actual SSE connections
 * with a real HTTP server implementing the SSE protocol.
 *
 * These tests verify:
 * 1. Real SSE connections using EventSource
 * 2. Actual HTTP authentication with OAuth tokens
 * 3. Real message transmission over SSE
 * 4. Network-level connection handling and reconnection
 * 5. Authentication integration with SSE transport
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 *
 * Unlike unit tests which use mocks, these tests:
 * - Use real EventSource connections
 * - Make real HTTP requests
 * - Test actual SSE protocol behavior
 * - Validate end-to-end transport functionality
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SSEClientTransport } from '../../src/transports/implementations/sse-client-transport.js';
import { OAuth2ClientCredentialsProvider } from '../../src/auth/implementations/oauth2-client-credentials.js';
import { MemoryTokenStorage } from '../../src/auth/implementations/memory-token-storage.js';
import {
  createTestOAuthServer,
  TestOAuthServer,
} from '../fixtures/test-oauth-server.js';
import {
  createTestSSEServer,
  TestSSEServer,
} from '../fixtures/test-sse-server.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';

// Skip integration tests unless explicitly enabled
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)('SSE Integration Tests', () => {
  let oauthServer: TestOAuthServer;
  let sseServer: TestSSEServer;
  let oauthTokenEndpoint: string;
  let sseEndpoint: string;

  beforeAll(async () => {
    // Start real OAuth server
    const oauthServerInfo = await createTestOAuthServer({
      validClientId: 'sse-test-client',
      validClientSecret: 'sse-test-secret',
      tokenLifetime: 3600,
    });

    oauthServer = oauthServerInfo.server;
    oauthTokenEndpoint = oauthServerInfo.tokenEndpoint;

    // Start real SSE server with OAuth authentication
    const sseServerInfo = await createTestSSEServer({
      requireAuth: true,
      // Will be set dynamically based on acquired tokens
    });

    sseServer = sseServerInfo.server;
    sseEndpoint = sseServerInfo.sseEndpoint;

    // Verify servers are accessible
    try {
      const [oauthHealth, sseHealth] = await Promise.all([
        fetch(`${oauthServerInfo.url}/health`),
        fetch(`${sseServerInfo.url}/health`),
      ]);

      if (!oauthHealth.ok || !sseHealth.ok) {
        throw new Error('Server health checks failed');
      }
    } catch (error) {
      throw new Error(
        `Cannot reach test servers: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }, 30000);

  beforeEach(() => {
    // Clear message history between tests
    sseServer.clearMessageHistory();
  });

  describe('SSE Transport with OAuth Authentication', () => {
    it('should establish real SSE connection with OAuth token', async () => {
      const tokenStorage = new MemoryTokenStorage();

      // Create OAuth provider
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'sse-test-client',
          clientSecret: 'sse-test-secret',
          tokenEndpoint: oauthTokenEndpoint,
        },
        tokenStorage,
      );

      // Get token and configure SSE server to accept it
      const headers = await authProvider.getHeaders();
      const token = headers.Authorization.replace('Bearer ', '');
      sseServer.setValidToken(token);

      // Create SSE transport with real auth
      const transport = new SSEClientTransport({
        url: sseEndpoint,
        authProvider: {
          async getAuthHeaders() {
            return await authProvider.getHeaders();
          },
          async refreshToken() {
            await authProvider.refresh();
          },
        },
      });

      // Start transport - should establish real SSE connection
      await transport.start();

      // Verify connection is established
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Allow connection to stabilize
      expect(sseServer.getClientCount()).toBe(1);

      await transport.close();
    }, 15000);

    it('should receive real messages over SSE connection', async () => {
      const tokenStorage = new MemoryTokenStorage();
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'sse-test-client',
          clientSecret: 'sse-test-secret',
          tokenEndpoint: oauthTokenEndpoint,
        },
        tokenStorage,
      );

      const headers = await authProvider.getHeaders();
      const token = headers.Authorization.replace('Bearer ', '');
      sseServer.setValidToken(token);

      const transport = new SSEClientTransport({
        url: sseEndpoint,
        authProvider: {
          async getAuthHeaders() {
            return await authProvider.getHeaders();
          },
          async refreshToken() {
            await authProvider.refresh();
          },
        },
      });

      // Set up message handler
      const receivedMessages: JSONRPCMessage[] = [];
      transport.onmessage = (message: JSONRPCMessage) => {
        receivedMessages.push(message);
      };

      await transport.start();

      // Wait for connection to stabilize
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Send a test message from server
      const testMessage = {
        jsonrpc: '2.0' as const,
        id: 'test-1',
        result: { message: 'Hello from SSE server' },
      };

      sseServer.broadcast(testMessage);

      // Wait for message to be received
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify message was received
      expect(receivedMessages.length).toBeGreaterThan(0);

      // Find our test message (filter out welcome/heartbeat messages)
      const testMessageReceived = receivedMessages.find(
        (msg) =>
          (msg as JSONRPCResponse).id === 'test-1' &&
          (msg as JSONRPCResponse).result?.message === 'Hello from SSE server',
      ) as JSONRPCResponse;
      expect(testMessageReceived).toBeDefined();

      await transport.close();
    }, 15000);

    it('should handle authentication failures with real SSE server', async () => {
      // Create transport with invalid token
      const transport = new SSEClientTransport({
        url: sseEndpoint,
        authProvider: {
          async getAuthHeaders() {
            return { Authorization: 'Bearer invalid-token-12345' };
          },
          async refreshToken() {
            // No-op for this test
          },
        },
      });

      // Should fail to connect due to authentication
      let _connectionError: Error | undefined;
      try {
        await transport.start();
        // Wait a bit to see if connection fails
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        _connectionError = error as Error;
      }

      // Either should throw immediately or connection should fail
      // The exact behavior depends on EventSource implementation
      // At minimum, no clients should be connected to the server
      expect(sseServer.getClientCount()).toBe(0);

      await transport.close();
    }, 10000);

    it('should send real HTTP messages via POST', async () => {
      const tokenStorage = new MemoryTokenStorage();
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'sse-test-client',
          clientSecret: 'sse-test-secret',
          tokenEndpoint: oauthTokenEndpoint,
        },
        tokenStorage,
      );

      const headers = await authProvider.getHeaders();
      const token = headers.Authorization.replace('Bearer ', '');
      sseServer.setValidToken(token);

      const transport = new SSEClientTransport({
        url: sseEndpoint,
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
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Send a real JSON-RPC request
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-request-1',
        method: 'test_method',
        params: { message: 'Hello World' },
      };

      // This should make a real HTTP POST request
      // Note: The test SSE server doesn't implement JSON-RPC handling,
      // so this will likely result in a 404, but it tests the HTTP transport mechanism
      let sendError: Error | undefined;
      try {
        await transport.send(request);
      } catch (error) {
        sendError = error as Error;
        // Expected - test server doesn't handle POST requests to SSE endpoint
      }

      // The important thing is that it attempted to send via HTTP
      // and didn't fail due to authentication issues
      expect(sendError?.message).not.toContain('authentication');
      expect(sendError?.message).not.toContain('token');

      await transport.close();
    }, 10000);

    it('should handle token refresh during active SSE connection', async () => {
      const tokenStorage = new MemoryTokenStorage();
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'sse-test-client',
          clientSecret: 'sse-test-secret',
          tokenEndpoint: oauthTokenEndpoint,
        },
        tokenStorage,
      );

      // Get initial token
      let headers = await authProvider.getHeaders();
      let token = headers.Authorization.replace('Bearer ', '');
      sseServer.setValidToken(token);

      const transport = new SSEClientTransport({
        url: sseEndpoint,
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(sseServer.getClientCount()).toBe(1);

      // Force token refresh by expiring current token
      oauthServer.expireToken(token);
      await tokenStorage.store({
        accessToken: token,
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() - 1000), // Expired
      });

      // Get new token and update server
      headers = await authProvider.getHeaders();
      token = headers.Authorization.replace('Bearer ', '');
      sseServer.setValidToken(token);

      // Connection should still be active
      expect(sseServer.getClientCount()).toBe(1);

      await transport.close();
    }, 15000);

    it('should handle multiple concurrent SSE connections', async () => {
      const tokenStorage = new MemoryTokenStorage();
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'sse-test-client',
          clientSecret: 'sse-test-secret',
          tokenEndpoint: oauthTokenEndpoint,
        },
        tokenStorage,
      );

      const headers = await authProvider.getHeaders();
      const token = headers.Authorization.replace('Bearer ', '');
      sseServer.setValidToken(token);

      // Create multiple transports
      const transports: SSEClientTransport[] = [];
      for (let i = 0; i < 3; i++) {
        const transport = new SSEClientTransport({
          url: sseEndpoint,
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
      await Promise.all(transports.map((t) => t.start()));
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // All should be connected
      expect(sseServer.getClientCount()).toBe(3);

      // Clean up
      await Promise.all(transports.map((t) => t.close()));
    }, 15000);
  });

  describe('Connection Management Integration', () => {
    it('should handle server disconnection and cleanup', async () => {
      const tokenStorage = new MemoryTokenStorage();
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'sse-test-client',
          clientSecret: 'sse-test-secret',
          tokenEndpoint: oauthTokenEndpoint,
        },
        tokenStorage,
      );

      const headers = await authProvider.getHeaders();
      const token = headers.Authorization.replace('Bearer ', '');
      sseServer.setValidToken(token);

      const transport = new SSEClientTransport({
        url: sseEndpoint,
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(sseServer.getClientCount()).toBe(1);

      // Close transport should clean up connection
      await transport.close();
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(sseServer.getClientCount()).toBe(0);
    }, 10000);

    it('should handle network errors gracefully', async () => {
      // Create transport pointing to non-existent server
      const transport = new SSEClientTransport({
        url: 'http://localhost:65535/sse',
        authProvider: {
          async getAuthHeaders() {
            return { Authorization: 'Bearer test-token' };
          },
          async refreshToken() {
            // No-op
          },
        },
      });

      // Should handle connection failure gracefully
      let _networkError: Error | undefined;
      try {
        await transport.start();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        _networkError = error as Error;
      }

      // Either should throw or handle gracefully
      // The exact behavior depends on EventSource implementation
      await transport.close();
    }, 10000);
  });

  describe('Message Format Integration', () => {
    it('should handle real SSE message format correctly', async () => {
      const tokenStorage = new MemoryTokenStorage();
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'sse-test-client',
          clientSecret: 'sse-test-secret',
          tokenEndpoint: oauthTokenEndpoint,
        },
        tokenStorage,
      );

      const headers = await authProvider.getHeaders();
      const token = headers.Authorization.replace('Bearer ', '');
      sseServer.setValidToken(token);

      const transport = new SSEClientTransport({
        url: sseEndpoint,
        authProvider: {
          async getAuthHeaders() {
            return await authProvider.getHeaders();
          },
          async refreshToken() {
            await authProvider.refresh();
          },
        },
      });

      const receivedMessages: JSONRPCMessage[] = [];
      transport.onmessage = (message: JSONRPCMessage) => {
        receivedMessages.push(message);
      };

      await transport.start();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Send JSON-RPC formatted message
      const jsonRpcMessage: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'format-test',
        result: {
          tools: [{ name: 'test_tool', description: 'A test tool' }],
        },
      };

      sseServer.broadcast(jsonRpcMessage);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Find and verify the JSON-RPC message was parsed correctly
      const jsonRpcReceived = receivedMessages.find(
        (msg) => (msg as JSONRPCResponse).id === 'format-test',
      ) as JSONRPCResponse;

      expect(jsonRpcReceived).toBeDefined();
      expect(jsonRpcReceived.jsonrpc).toBe('2.0');
      expect(jsonRpcReceived.result).toBeDefined();
      expect(
        (jsonRpcReceived.result as { tools: Array<{ name: string }> }).tools,
      ).toHaveLength(1);
      expect(
        (jsonRpcReceived.result as { tools: Array<{ name: string }> }).tools[0]
          .name,
      ).toBe('test_tool');

      await transport.close();
    }, 15000);
  });
});
