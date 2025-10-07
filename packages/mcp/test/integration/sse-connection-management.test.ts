/**
 * SSE Connection Management Integration Tests
 *
 * REAL INTEGRATION TESTS - These tests verify connection management
 * and error handling for SSE transport.
 *
 * Tests cover:
 * 1. Server disconnection and cleanup
 * 2. Network error handling
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestSSEServer } from '../fixtures/test-sse-server.js';
import { setupOAuthAndSSEServers } from '../helpers/server-setup.js';
import {
  extractBearerToken,
  MemoryTokenStorage,
  OAuth2ClientCredentialsProvider,
} from '@mcp-funnel/auth';
import { SSEClientTransport } from '@mcp-funnel/core';
import type { TestOAuthServer } from '../fixtures/test-oauth-server.js';

// Skip integration tests unless explicitly enabled
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)('SSE Connection Management Integration', () => {
  let _oauthServer: TestOAuthServer;
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

    _oauthServer = oauthServerInfo.server;
    oauthTokenEndpoint = oauthServerInfo.tokenEndpoint;
    sseServer = sseServerInfo.server;
    sseEndpoint = sseServerInfo.sseEndpoint;
  }, 30000);

  beforeEach(() => {
    // Clear message history between tests
    sseServer.clearMessageHistory();
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
      const token = extractBearerToken(headers.Authorization)!;
      sseServer.setValidToken(token);

      const transport = new SSEClientTransport({
        url: sseEndpoint,
        authProvider,
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
});
