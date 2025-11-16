/**
 * WebSocket Protocol Features Integration Tests
 *
 * REAL INTEGRATION TESTS - These tests verify WebSocket-specific
 * protocol features.
 *
 * Tests cover:
 * 1. Server-initiated disconnection
 * 2. Message broadcasting
 * 3. Ping/pong heartbeat
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
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

describe.skipIf(!runIntegrationTests)('WebSocket Protocol Features Integration', () => {
  let _oauthServer: TestOAuthServer;
  let wsServer: TestWebSocketServer;
  let oauthTokenEndpoint: string;
  let wsEndpoint: string;

  beforeAll(async () => {
    const { oauthServerInfo, wsServerInfo } = await setupOAuthAndWebSocketServers({
      clientId: 'ws-test-client',
      clientSecret: 'ws-test-secret',
      tokenLifetime: 3600,
      requireAuth: true,
    });

    _oauthServer = oauthServerInfo.server;
    oauthTokenEndpoint = oauthServerInfo.tokenEndpoint;
    wsServer = wsServerInfo.server;
    wsEndpoint = wsServerInfo.wsEndpoint;
  }, 30000);

  beforeEach(() => {
    // Clear message history between tests
    wsServer.clearMessageHistory();
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
        authProvider,
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
      wsServer.disconnectClient(clients[0], 1000, 'Server initiated disconnect');

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
          msg.direction === 'incoming' && 'method' in msg.data && msg.data.method === 'ping_test',
      );
      expect(pingMessage).toBeDefined();
    }, 15000);
  });
});
