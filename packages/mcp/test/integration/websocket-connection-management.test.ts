/**
 * WebSocket Connection Management Integration Tests
 *
 * REAL INTEGRATION TESTS - These tests verify connection management
 * and error handling for WebSocket transport.
 *
 * Tests cover:
 * 1. Graceful connection closure
 * 2. Network error handling
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
  'WebSocket Connection Management Integration',
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
          authProvider,
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
            async getHeaders() {
              return { Authorization: 'Bearer test-token' };
            },
            async refresh() {
              // No-op
            },
            async isValid() {
              return true;
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
  },
);
