/**
 * OAuth + WebSocket Performance Integration Tests
 *
 * REAL END-TO-END INTEGRATION TESTS - These tests verify performance
 * and load handling in OAuth + WebSocket integration scenarios.
 *
 * Tests cover:
 * 1. High-frequency bidirectional message transmission
 * 2. Connection stability under load
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestWebSocketServer } from '../fixtures/test-websocket-server.js';
import { setupOAuthAndWebSocketServers } from '../helpers/server-setup.js';
import type {
  JSONRPCResponse,
  JSONRPCRequest,
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
  'OAuth + WebSocket Performance Integration',
  () => {
    let _oauthServer: TestOAuthServer;
    let wsServer: TestWebSocketServer;
    let oauthTokenEndpoint: string;
    let wsEndpoint: string;

    beforeAll(async () => {
      const { oauthServerInfo, wsServerInfo } =
        await setupOAuthAndWebSocketServers({
          clientId: 'e2e-ws-client',
          clientSecret: 'e2e-ws-secret',
          tokenLifetime: 3600,
          requireAuth: true,
        });

      _oauthServer = oauthServerInfo.server;
      oauthTokenEndpoint = oauthServerInfo.tokenEndpoint;
      wsServer = wsServerInfo.server;
      wsEndpoint = wsServerInfo.wsEndpoint;
    }, 30000);

    beforeEach(() => {
      wsServer.clearMessageHistory();
    });

    describe('Performance and Load', () => {
      it('should handle high-frequency bidirectional message transmission', async () => {
        const tokenStorage = new MemoryTokenStorage();
        const authProvider = new OAuth2ClientCredentialsProvider(
          {
            type: 'oauth2-client',
            clientId: 'e2e-ws-client',
            clientSecret: 'e2e-ws-secret',
            tokenEndpoint: oauthTokenEndpoint,
          },
          tokenStorage,
        );

        const authHeaders = await authProvider.getHeaders();
        const token = extractBearerToken(authHeaders.Authorization)!;
        wsServer.setValidToken(token);

        const transport = new WebSocketClientTransport({
          url: wsEndpoint,
          authProvider,
        });

        const receivedMessages: JSONRPCMessage[] = [];
        transport.onmessage = (message: JSONRPCMessage) => {
          receivedMessages.push(message);
        };

        await transport.start();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Send multiple messages rapidly from client to server
        const messageCount = 10;
        for (let i = 0; i < messageCount; i++) {
          const message: JSONRPCRequest = {
            jsonrpc: '2.0',
            id: `perf-client-${i}`,
            method: 'performance_test',
            params: { index: i, timestamp: Date.now() },
          };
          await transport.send(message);

          // Small delay to avoid overwhelming
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        // Send multiple messages from server to client
        for (let i = 0; i < messageCount; i++) {
          const message: JSONRPCResponse = {
            jsonrpc: '2.0',
            id: `perf-server-${i}`,
            result: { index: i, timestamp: Date.now() },
          };
          wsServer.broadcast(message);

          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        // Wait for all messages to be processed
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify server received client messages
        const serverHistory = wsServer.getMessageHistory();
        const clientMessages = serverHistory.filter(
          (msg) =>
            msg.direction === 'incoming' &&
            'method' in msg.data &&
            msg.data.method === 'performance_test',
        );
        expect(clientMessages).toHaveLength(messageCount);

        // Verify client received server messages
        const serverMessages = receivedMessages.filter(
          (msg) => 'id' in msg && String(msg.id).startsWith('perf-server-'),
        );
        expect(serverMessages).toHaveLength(messageCount);

        await transport.close();
      }, 20000);

      it('should maintain connection stability under load', async () => {
        const tokenStorage = new MemoryTokenStorage();
        const authProvider = new OAuth2ClientCredentialsProvider(
          {
            type: 'oauth2-client',
            clientId: 'e2e-ws-client',
            clientSecret: 'e2e-ws-secret',
            tokenEndpoint: oauthTokenEndpoint,
          },
          tokenStorage,
        );

        const authHeaders = await authProvider.getHeaders();
        const token = extractBearerToken(authHeaders.Authorization)!;
        wsServer.setValidToken(token);

        const transport = new WebSocketClientTransport({
          url: wsEndpoint,
          authProvider,
          pingInterval: 500, // Frequent pings for load testing
        });

        await transport.start();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify initial connection
        expect(wsServer.getClientCount()).toBe(1);

        // Send messages continuously for several seconds
        const startTime = Date.now();
        const duration = 3000; // 3 seconds
        let messagesSent = 0;

        while (Date.now() - startTime < duration) {
          const message: JSONRPCRequest = {
            jsonrpc: '2.0',
            id: `load-test-${messagesSent}`,
            method: 'load_test',
            params: { sequence: messagesSent },
          };

          try {
            await transport.send(message);
            messagesSent++;
          } catch (error) {
            // Connection should remain stable
            throw new Error(`Connection failed during load test: ${error}`);
          }

          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // Verify connection is still active
        expect(wsServer.getClientCount()).toBe(1);
        expect(messagesSent).toBeGreaterThan(100); // Should have sent many messages

        await transport.close();
      }, 20000);
    });
  },
);
