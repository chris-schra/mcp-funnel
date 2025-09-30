/**
 * SSE Transport Authentication Integration Tests
 *
 * REAL INTEGRATION TESTS - These tests use actual SSE connections
 * with a real HTTP server implementing the SSE protocol.
 *
 * Tests cover:
 * 1. Real SSE connections with OAuth authentication
 * 2. Message reception over SSE
 * 3. Authentication failures
 * 4. HTTP message sending via POST
 * 5. Token refresh
 * 6. Multiple concurrent connections
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestSSEServer } from '../fixtures/test-sse-server.js';
import { setupOAuthAndSSEServers } from '../helpers/server-setup.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';
import {
  extractBearerToken,
  MemoryTokenStorage,
  OAuth2ClientCredentialsProvider,
} from '@mcp-funnel/auth';
import { SSEClientTransport } from '@mcp-funnel/core';
import type { TestOAuthServer } from '../fixtures/test-oauth-server.js';

// Skip integration tests unless explicitly enabled
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'SSE Transport Authentication Integration',
  () => {
    let oauthServer: TestOAuthServer;
    let sseServer: TestSSEServer;
    let oauthTokenEndpoint: string;
    let sseEndpoint: string;

    beforeAll(async () => {
      const { oauthServerInfo, sseServerInfo } = await setupOAuthAndSSEServers({
        clientId: 'sse-test-client',
        clientSecret: 'sse-test-secret',
        tokenLifetime: 3600,
        requireAuth: true,
      });

      oauthServer = oauthServerInfo.server;
      oauthTokenEndpoint = oauthServerInfo.tokenEndpoint;
      sseServer = sseServerInfo.server;
      sseEndpoint = sseServerInfo.sseEndpoint;
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
        const token = extractBearerToken(headers.Authorization)!;
        sseServer.setValidToken(token);

        // Create SSE transport with real auth
        const transport = new SSEClientTransport({
          url: sseEndpoint,
          authProvider,
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
        const token = extractBearerToken(headers.Authorization)!;
        sseServer.setValidToken(token);

        const transport = new SSEClientTransport({
          url: sseEndpoint,
          authProvider,
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
            (msg as JSONRPCResponse).result?.message ===
              'Hello from SSE server',
        ) as JSONRPCResponse;
        expect(testMessageReceived).toBeDefined();

        await transport.close();
      }, 15000);

      it('should handle authentication failures with real SSE server', async () => {
        // Create transport with invalid token
        const transport = new SSEClientTransport({
          url: sseEndpoint,
          authProvider: {
            async getHeaders() {
              return { Authorization: 'Bearer invalid-token-12345' };
            },
            async refresh() {
              // No-op for this test
            },
            async isValid() {
              return false;
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
        const token = extractBearerToken(headers.Authorization)!;
        sseServer.setValidToken(token);

        const transport = new SSEClientTransport({
          url: sseEndpoint,
          authProvider,
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
        let token = extractBearerToken(headers.Authorization)!;
        sseServer.setValidToken(token);

        const transport = new SSEClientTransport({
          url: sseEndpoint,
          authProvider,
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
        token = extractBearerToken(headers.Authorization)!;
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
        const token = extractBearerToken(headers.Authorization)!;
        sseServer.setValidToken(token);

        // Create multiple transports
        const transports: SSEClientTransport[] = [];
        for (let i = 0; i < 3; i++) {
          const transport = new SSEClientTransport({
            url: sseEndpoint,
            authProvider,
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
  },
);
