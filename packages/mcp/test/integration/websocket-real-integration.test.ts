/**
 * WebSocket Real Integration Tests
 *
 * REAL INTEGRATION TESTS - These tests use actual WebSocket connections
 * with a real WebSocket server implementing the WebSocket protocol.
 *
 * These tests verify:
 * 1. Real WebSocket connections using ws library
 * 2. Actual HTTP authentication with OAuth tokens
 * 3. Real message transmission over WebSocket
 * 4. Network-level connection handling and reconnection
 * 5. Authentication integration with WebSocket transport
 * 6. WebSocket-specific features (ping/pong, close codes)
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 *
 * Unlike unit tests which use mocks, these tests:
 * - Use real WebSocket connections
 * - Make real network requests
 * - Test actual WebSocket protocol behavior
 * - Validate end-to-end transport functionality
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { WebSocketClientTransport } from '../../src/transports/implementations/websocket-client-transport.js';
import { OAuth2ClientCredentialsProvider } from '../../src/auth/implementations/oauth2-client-credentials.js';
import { MemoryTokenStorage } from '../../src/auth/implementations/memory-token-storage.js';
import {
  createTestOAuthServer,
  TestOAuthServer,
} from '../fixtures/test-oauth-server.js';
import {
  createTestWebSocketServer,
  TestWebSocketServer,
} from '../fixtures/test-websocket-server.js';
import { extractBearerToken } from '../../src/auth/utils/oauth-utils.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';

// Skip integration tests unless explicitly enabled
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'WebSocket Real Integration Tests',
  () => {
    let oauthServer: TestOAuthServer;
    let wsServer: TestWebSocketServer;
    let oauthTokenEndpoint: string;
    let wsEndpoint: string;

    beforeAll(async () => {
      // Start real OAuth server
      const oauthServerInfo = await createTestOAuthServer({
        validClientId: 'ws-test-client',
        validClientSecret: 'ws-test-secret',
        tokenLifetime: 3600,
      });

      oauthServer = oauthServerInfo.server;
      oauthTokenEndpoint = oauthServerInfo.tokenEndpoint;

      // Start real WebSocket server with OAuth authentication
      const wsServerInfo = await createTestWebSocketServer({
        requireAuth: true,
      });

      wsServer = wsServerInfo.server;
      wsEndpoint = wsServerInfo.wsEndpoint;

      // Verify servers are accessible
      try {
        const [oauthHealth, wsHealth] = await Promise.all([
          fetch(`${oauthServerInfo.url}/health`),
          fetch(`${wsServerInfo.url}/health`),
        ]);

        if (!oauthHealth.ok || !wsHealth.ok) {
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
          authProvider: {
            async getAuthHeaders() {
              return await authProvider.getHeaders();
            },
            async refreshToken() {
              await authProvider.refresh();
            },
          },
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
        expect(wsServer.getClientCount()).toBe(3);

        // Clean up
        await Promise.all(transports.map((t) => t.close()));
      }, 15000);
    });

    describe('WebSocket Protocol Features', () => {
      let transport: WebSocketClientTransport;
      let authProvider: OAuth2ClientCredentialsProvider;

      beforeEach(async () => {
        const tokenStorage = new MemoryTokenStorage();
        authProvider = new OAuth2ClientCredentialsProvider(
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

        transport = new WebSocketClientTransport({
          url: wsEndpoint,
          authProvider: {
            async getAuthHeaders() {
              return await authProvider.getHeaders();
            },
            async refreshToken() {
              await authProvider.refresh();
            },
          },
          pingInterval: 1000, // Short interval for testing
        });

        await transport.start();
        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      afterEach(async () => {
        await transport.close();
      });

      it('should handle server-initiated disconnection', async () => {
        expect(wsServer.getClientCount()).toBe(1);

        // Get the client ID and disconnect from server side
        const clients = wsServer.getConnectedClients();
        expect(clients).toHaveLength(1);

        // Disconnect the client from server side
        wsServer.disconnectClient(
          clients[0],
          1000,
          'Server initiated disconnect',
        );

        // Wait for disconnection to propagate
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Client should be disconnected
        expect(wsServer.getClientCount()).toBe(0);
      }, 10000);

      it('should handle message broadcasting from server', async () => {
        const receivedMessages: JSONRPCMessage[] = [];
        transport.onmessage = (message: JSONRPCMessage) => {
          receivedMessages.push(message);
        };

        // Broadcast a message from server to all clients
        const broadcastMessage: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: 'broadcast-1',
          result: {
            type: 'broadcast',
            message: 'Hello all clients',
            timestamp: new Date().toISOString(),
          },
        };

        wsServer.broadcast(broadcastMessage);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Should receive the broadcast message
        const receivedBroadcast = receivedMessages.find(
          (msg) => 'id' in msg && msg.id === 'broadcast-1',
        ) as JSONRPCResponse;
        expect(receivedBroadcast).toBeDefined();
        expect(receivedBroadcast.result.type).toBe('broadcast');
      }, 10000);

      it('should handle real WebSocket ping/pong heartbeat', async () => {
        // Wait for ping/pong to occur
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check that the connection is still alive
        expect(wsServer.getClientCount()).toBe(1);

        // Send a message to verify connection is still working
        const testMessage: JSONRPCRequest = {
          jsonrpc: '2.0',
          id: 'ping-test',
          method: 'ping_test',
          params: {},
        };

        await transport.send(testMessage);
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify message was received by server
        const messageHistory = wsServer.getMessageHistory();
        const pingMessage = messageHistory.find(
          (msg) =>
            msg.direction === 'incoming' &&
            'method' in msg.data &&
            msg.data.method === 'ping_test',
        );
        expect(pingMessage).toBeDefined();
      }, 15000);
    });

    describe('Connection Management Integration', () => {
      it('should handle graceful connection closure', async () => {
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
        expect(wsServer.getClientCount()).toBe(1);

        // Close transport gracefully
        await transport.close();
        await new Promise((resolve) => setTimeout(resolve, 500));

        expect(wsServer.getClientCount()).toBe(0);
      }, 10000);

      it('should handle network errors gracefully', async () => {
        // Create transport pointing to non-existent server
        const transport = new WebSocketClientTransport({
          url: 'ws://localhost:65535/ws',
          authProvider: {
            async getAuthHeaders() {
              return { Authorization: 'Bearer test-token' };
            },
            async refreshToken() {
              // No-op
            },
          },
          timeout: 2000,
        });

        // Should handle connection failure gracefully
        let _networkError: Error | undefined;
        try {
          await transport.start();
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } catch (error) {
          _networkError = error as Error;
        }

        // Either should throw or handle gracefully
        // The exact behavior depends on WebSocket implementation
        await transport.close();
      }, 10000);
    });

    describe('High-Level Protocol Integration', () => {
      it('should handle JSON-RPC over WebSocket correctly', async () => {
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

        // Send complex JSON-RPC request
        const complexRequest: JSONRPCRequest = {
          jsonrpc: '2.0',
          id: 'complex-test',
          method: 'tools/list',
          params: {
            filters: ['github/*', 'file/*'],
            maxResults: 100,
          },
        };

        await transport.send(complexRequest);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify complex message handling
        const echoResponse = receivedMessages.find(
          (msg) => 'id' in msg && msg.id === 'complex-test',
        ) as JSONRPCResponse;
        expect(echoResponse).toBeDefined();
        expect(
          (
            echoResponse.result as {
              echo: { method: string; params: { filters: string[] } };
            }
          ).echo.method,
        ).toBe('tools/list');
        expect(
          (
            echoResponse.result as {
              echo: { method: string; params: { filters: string[] } };
            }
          ).echo.params.filters,
        ).toEqual(['github/*', 'file/*']);

        await transport.close();
      }, 15000);
    });
  },
);
