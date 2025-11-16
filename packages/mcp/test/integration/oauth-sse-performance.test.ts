/**
 * OAuth + SSE Performance Integration Tests
 *
 * REAL END-TO-END INTEGRATION TESTS - These tests verify performance
 * and load handling in OAuth + SSE integration scenarios.
 *
 * Tests cover:
 * 1. High-frequency message transmission
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { TestSSEServer } from '../fixtures/test-sse-server.js';
import { setupOAuthAndSSEServers } from '../helpers/server-setup.js';
import type { JSONRPCResponse, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  extractBearerToken,
  MemoryTokenStorage,
  OAuth2ClientCredentialsProvider,
} from '@mcp-funnel/auth';
import { SSEClientTransport } from '@mcp-funnel/core';
import type { TestOAuthServer } from '../fixtures/test-oauth-server.js';

// Skip integration tests unless explicitly enabled
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)('OAuth + SSE Performance Integration', () => {
  let _oauthServer: TestOAuthServer;
  let sseServer: TestSSEServer;
  let oauthTokenEndpoint: string;
  let sseEndpoint: string;

  beforeAll(async () => {
    const { oauthServerInfo, sseServerInfo } = await setupOAuthAndSSEServers({
      clientId: 'e2e-integration-client',
      clientSecret: 'e2e-integration-secret',
      tokenLifetime: 3600,
      requireAuth: true,
    });

    _oauthServer = oauthServerInfo.server;
    oauthTokenEndpoint = oauthServerInfo.tokenEndpoint;
    sseServer = sseServerInfo.server;
    sseEndpoint = sseServerInfo.sseEndpoint;
  }, 30000);

  beforeEach(() => {
    sseServer.clearMessageHistory();
  });

  describe('Performance and Load', () => {
    it('should handle high-frequency message transmission', async () => {
      const tokenStorage = new MemoryTokenStorage();
      const authProvider = new OAuth2ClientCredentialsProvider(
        {
          type: 'oauth2-client',
          clientId: 'e2e-integration-client',
          clientSecret: 'e2e-integration-secret',
          tokenEndpoint: oauthTokenEndpoint,
        },
        tokenStorage,
      );

      const authHeaders = await authProvider.getHeaders();
      const token = extractBearerToken(authHeaders.Authorization)!;
      sseServer.setValidToken(token);

      const transport = new SSEClientTransport({
        url: sseEndpoint,
        authProvider,
      });

      const receivedMessages: JSONRPCMessage[] = [];
      transport.onmessage = (message: JSONRPCMessage) => {
        receivedMessages.push(message);
      };

      await transport.start();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Send multiple messages rapidly
      const messageCount = 10;
      for (let i = 0; i < messageCount; i++) {
        const message: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: `perf-test-${i}`,
          result: { index: i, timestamp: Date.now() },
        };
        sseServer.broadcast(message);

        // Small delay to avoid overwhelming
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Wait for all messages to be received
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Count messages with our test prefix (excluding welcome/heartbeat)
      const testMessages = receivedMessages.filter(
        (msg) =>
          (msg as JSONRPCResponse).id &&
          String((msg as JSONRPCResponse).id).startsWith('perf-test-'),
      );

      expect(testMessages.length).toBe(messageCount);

      await transport.close();
    }, 20000);
  });
});
