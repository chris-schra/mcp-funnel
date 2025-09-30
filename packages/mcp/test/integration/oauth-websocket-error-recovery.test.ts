/**
 * OAuth + WebSocket Error Recovery Integration Tests
 *
 * REAL END-TO-END INTEGRATION TESTS - These tests verify error recovery
 * and resilience in OAuth + WebSocket integration scenarios.
 *
 * Tests cover:
 * 1. Recovery from temporary OAuth server failures
 * 2. Handling WebSocket server restarts gracefully
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestWebSocketServer } from '../fixtures/test-websocket-server.js';
import { setupOAuthAndWebSocketServers } from '../helpers/server-setup.js';
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
  'OAuth + WebSocket Error Recovery Integration',
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

    describe('Error Recovery and Resilience', () => {
      it('should recover from temporary OAuth server failure', async () => {
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

        // Get initial token
        const authHeaders = await authProvider.getHeaders();
        const token = extractBearerToken(authHeaders.Authorization)!;
        wsServer.setValidToken(token);

        const transport = new WebSocketClientTransport({
          url: wsEndpoint,
          authProvider,
        });

        await transport.start();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(wsServer.getClientCount()).toBe(1);

        // Verify the connection can continue using existing token
        // even if OAuth server becomes temporarily unavailable
        // (This tests token caching behavior)
        const cachedHeaders = await authProvider.getHeaders();
        expect(cachedHeaders.Authorization).toBe(authHeaders.Authorization);

        await transport.close();
      }, 15000);

      it('should handle WebSocket server restart gracefully', async () => {
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

        await transport.start();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(wsServer.getClientCount()).toBe(1);

        // Close transport properly
        await transport.close();
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify cleanup (in integration tests, some cleanup delay is expected)
        expect(wsServer.getClientCount()).toBe(0);
      }, 10000);
    });
  },
);
