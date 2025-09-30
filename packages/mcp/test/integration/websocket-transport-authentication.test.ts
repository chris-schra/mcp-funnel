/**
 * WebSocket Transport Authentication Integration Tests
 *
 * REAL INTEGRATION TESTS - These tests use actual WebSocket connections
 * with a real WebSocket server implementing the WebSocket protocol.
 *
 * Tests cover:
 * 1. Real WebSocket connections with OAuth authentication
 * 2. Bidirectional message transmission
 * 3. Authentication failures
 * 4. Token refresh
 * 5. Multiple concurrent connections
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestWebSocketServer } from '../fixtures/test-websocket-server.js';
import { setupOAuthAndWebSocketServers } from '../helpers/server-setup.js';
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
import { WebSocketClientTransport } from '@mcp-funnel/core';
import type { TestOAuthServer } from '../fixtures/test-oauth-server.js';

// Skip integration tests unless explicitly enabled
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'WebSocket Transport Authentication Integration',
  () => {
    let oauthServer: TestOAuthServer;
    let wsServer: TestWebSocketServer;
    let oauthTokenEndpoint: string;
    let wsEndpoint: string;

    beforeAll(async () => {
      const { oauthServerInfo, wsServerInfo } =
        await setupOAuthAndWebSocketServers({
          clientId: 'ws-test-client',
          clientSecret: 'ws-test-secret',
          tokenLifetime: 3600,
          requireAuth: true,
        });

      oauthServer = oauthServerInfo.server;
      oauthTokenEndpoint = oauthServerInfo.tokenEndpoint;
      wsServer = wsServerInfo.server;
      wsEndpoint = wsServerInfo.wsEndpoint;
    }, 30000);

    beforeEach(() => {
      // Clear message history between tests
      wsServer.clearMessageHistory();
    });

    describe('WebSocket Transport with OAuth Authentication', () => {
      it('should establish real WebSocket connection with OAuth token', async () => {
        const tokenStorage = new MemoryTokenStorage();

        // Create OAuth provider
        const authProvider = new OAuth2ClientCredentialsProvider(
          {
            type: 'oauth2-client',
            clientId: 'ws-test-client',
            clientSecret: 'ws-test-secret',
            tokenEndpoint: oauthTokenEndpoint,
          },
          tokenStorage,
        );

        // Get token and configure WebSocket server to accept it
        const headers = await authProvider.getHeaders();
        const token = extractBearerToken(headers.Authorization)!;
        wsServer.setValidToken(token);

        // Create WebSocket transport with real auth
        const transport = new WebSocketClientTransport({
          url: wsEndpoint,
          authProvider,
        });

        // Start transport - should establish real WebSocket connection
        await transport.start();

        // Wait for connection to stabilize
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify connection is established
        expect(wsServer.getClientCount()).toBe(1);

        await transport.close();
      }, 15000);

      it('should send and receive real messages over WebSocket connection', async () => {
        const tokenStorage = new MemoryTokenStorage();
        const authProvider = new OAuth2ClientCredentialsProvider(
          {
            type: 'oauth2-client',
            clientId: 'ws-test-client',
            clientSecret: 'ws-test-secret',
            tokenEndpoint: oauthTokenEndpoint,
          },
          tokenStorage,
        );

        const headers = await authProvider.getHeaders();
        const token = extractBearerToken(headers.Authorization)!;
        wsServer.setValidToken(token);

        const transport = new WebSocketClientTransport({
          url: wsEndpoint,
          authProvider,
        });

        // Set up message handler
        const receivedMessages: JSONRPCMessage[] = [];
        transport.onmessage = (message: JSONRPCMessage) => {
          receivedMessages.push(message);
        };

        await transport.start();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Send a test request that the server will echo back
        const testRequest: JSONRPCRequest = {
          jsonrpc: '2.0',
          id: 'ws-test-1',
          method: 'test_method',
          params: { message: 'Hello WebSocket' },
        };

        await transport.send(testRequest);

        // Wait for message to be processed
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify the server received our message
        const messageHistory = wsServer.getMessageHistory();
        const sentMessage = messageHistory.find(
          (msg) =>
            msg.direction === 'incoming' &&
            'method' in msg.data &&
            msg.data.method === 'test_method',
        );
        expect(sentMessage).toBeDefined();

        // Verify we received the echo response
        const echoResponse = receivedMessages.find(
          (msg) => 'id' in msg && msg.id === 'ws-test-1',
        ) as JSONRPCResponse;
        expect(echoResponse).toBeDefined();
        expect(
          (echoResponse.result as { echo: { method: string } }).echo.method,
        ).toBe('test_method');

        await transport.close();
      }, 15000);

      it('should handle authentication failures with real WebSocket server', async () => {
        // Create transport with invalid token
        const transport = new WebSocketClientTransport({
          url: wsEndpoint,
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
        // The exact behavior depends on WebSocket implementation
        // At minimum, no clients should be connected to the server
        expect(wsServer.getClientCount()).toBe(0);

        await transport.close();
      }, 10000);

      it('should handle token refresh during active WebSocket connection', async () => {
        const tokenStorage = new MemoryTokenStorage();
        const authProvider = new OAuth2ClientCredentialsProvider(
          {
            type: 'oauth2-client',
            clientId: 'ws-test-client',
            clientSecret: 'ws-test-secret',
            tokenEndpoint: oauthTokenEndpoint,
          },
          tokenStorage,
        );

        // Get initial token
        let headers = await authProvider.getHeaders();
        let token = extractBearerToken(headers.Authorization)!;
        wsServer.setValidToken(token);

        const transport = new WebSocketClientTransport({
          url: wsEndpoint,
          authProvider,
        });

        await transport.start();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(wsServer.getClientCount()).toBe(1);

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
        wsServer.setValidToken(token);

        // Connection should still be active
        expect(wsServer.getClientCount()).toBe(1);

        await transport.close();
      }, 15000);

      it('should handle multiple concurrent WebSocket connections', async () => {
        const tokenStorage = new MemoryTokenStorage();
        const authProvider = new OAuth2ClientCredentialsProvider(
          {
            type: 'oauth2-client',
            clientId: 'ws-test-client',
            clientSecret: 'ws-test-secret',
            tokenEndpoint: oauthTokenEndpoint,
          },
          tokenStorage,
        );

        const headers = await authProvider.getHeaders();
        const token = extractBearerToken(headers.Authorization)!;
        wsServer.setValidToken(token);

        // Create multiple transports
        const transports: WebSocketClientTransport[] = [];
        for (let i = 0; i < 3; i++) {
          const transport = new WebSocketClientTransport({
            url: wsEndpoint,
            authProvider,
          });
          transports.push(transport);
        }

        // Start all transports concurrently
        await Promise.all(transports.map((t) => t.start()));
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // All should be connected
        expect(wsServer.getClientCount()).toBe(3);

        // Clean up
        await Promise.all(transports.map((t) => t.close()));
      }, 15000);
    });
  },
);
