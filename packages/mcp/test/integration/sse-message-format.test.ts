/**
 * SSE Message Format Integration Tests
 *
 * REAL INTEGRATION TESTS - These tests verify message format handling
 * for SSE transport.
 *
 * Tests cover:
 * 1. Real SSE message format parsing
 * 2. JSON-RPC formatted messages
 *
 * Run with: RUN_INTEGRATION_TESTS=true yarn test
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestSSEServer } from '../fixtures/test-sse-server.js';
import { setupOAuthAndSSEServers } from '../helpers/server-setup.js';
import type {
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

describe.skipIf(!runIntegrationTests)('SSE Message Format Integration', () => {
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

  describe('Message Format Integration', () => {
    it('should handle real SSE message format correctly', async () => {
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

      const receivedMessages: JSONRPCMessage[] = [];
      transport.onmessage = (message: JSONRPCMessage) => {
        receivedMessages.push(message);
      };

      await transport.start();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Send JSON-RPC formatted message
      const jsonRpcMessage: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'format-test',
        result: {
          tools: [{ name: 'test_tool', description: 'A test tool' }],
        },
      };

      sseServer.broadcast(jsonRpcMessage);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Find and verify the JSON-RPC message was parsed correctly
      const jsonRpcReceived = receivedMessages.find(
        (msg) => (msg as JSONRPCResponse).id === 'format-test',
      ) as JSONRPCResponse;

      expect(jsonRpcReceived).toBeDefined();
      expect(jsonRpcReceived.jsonrpc).toBe('2.0');
      expect(jsonRpcReceived.result).toBeDefined();
      expect(
        (jsonRpcReceived.result as { tools: Array<{ name: string }> }).tools,
      ).toHaveLength(1);
      expect(
        (jsonRpcReceived.result as { tools: Array<{ name: string }> }).tools[0]
          .name,
      ).toBe('test_tool');

      await transport.close();
    }, 15000);
  });
});
