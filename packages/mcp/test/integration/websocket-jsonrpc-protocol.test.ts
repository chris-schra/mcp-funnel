/**
 * WebSocket JSON-RPC Protocol Integration Tests
 *
 * REAL INTEGRATION TESTS - These tests verify JSON-RPC over WebSocket
 * implementation.
 *
 * Tests cover:
 * 1. JSON-RPC formatted message handling
 * 2. Complex parameter handling
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
  'WebSocket JSON-RPC Protocol Integration',
  () => {
    let _oauthServer: TestOAuthServer;
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

      _oauthServer = oauthServerInfo.server;
      oauthTokenEndpoint = oauthServerInfo.tokenEndpoint;
      wsServer = wsServerInfo.server;
      wsEndpoint = wsServerInfo.wsEndpoint;
    }, 30000);

    beforeEach(() => {
      // Clear message history between tests
      wsServer.clearMessageHistory();
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
          authProvider,
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
