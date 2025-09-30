/**
 * Tests for message correlation (request ID generation, pending request tracking)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  setupBaseClientTransportTest,
  type JSONRPCRequest,
  type JSONRPCResponse,
} from './test-utils.js';

describe('BaseClientTransport', () => {
  const { transport } = setupBaseClientTransportTest();

  describe('Message Correlation', () => {
    it('generates request ID when not present', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: '',
        method: 'test/method',
        params: {},
      };

      // Start the send but don't wait for response
      const sendPromise = transport.send(request);

      // Check that ID was generated and message was sent
      expect(request.id).toMatch(/^\d{13}_[a-f0-9]{8}$/);
      expect(transport.sendMessageCalls).toHaveLength(1);
      expect(transport.sendMessageCalls[0]).toBe(request);

      // Send response to prevent timeout
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: request.id,
        result: { success: true },
      };
      transport.testHandleMessage(response);

      // Now wait for completion
      await expect(sendPromise).resolves.toBeUndefined();
    });

    it('preserves existing request ID', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'existing-id',
        method: 'test/method',
        params: {},
      };

      // Start the send but don't wait for response
      const sendPromise = transport.send(request);

      expect(request.id).toBe('existing-id');

      // Send response to prevent timeout
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'existing-id',
        result: { success: true },
      };
      transport.testHandleMessage(response);

      // Now wait for completion
      await expect(sendPromise).resolves.toBeUndefined();
    });

    it('tracks pending requests for correlation', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      const sendPromise = transport.send(request);

      const pendingRequests = transport.getPendingRequests();
      expect(pendingRequests.has('test-id')).toBe(true);

      const pending = pendingRequests.get('test-id');
      expect(pending).toBeDefined();
      expect(pending!.timestamp).toBeCloseTo(Date.now(), -2);

      // Send response to prevent timeout and complete the test
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'test-id',
        result: { success: true },
      };
      transport.testHandleMessage(response);

      await expect(sendPromise).resolves.toBeUndefined();
    });

    it('cleans up pending requests on response', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      // Add pending request
      const sendPromise = transport.send(request);
      expect(transport.getPendingRequests().has('test-id')).toBe(true);

      // Simulate response
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'test-id',
        result: { success: true },
      };

      transport.testHandleMessage(response);

      // Wait for promise to resolve
      await expect(sendPromise).resolves.toBeUndefined();
      expect(transport.getPendingRequests().has('test-id')).toBe(false);
    });

    it('sends non-request messages directly without correlation', async () => {
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'response-id',
        result: { value: 'test-result' },
      };

      await transport.send(response);

      expect(transport.sendMessageCalls).toHaveLength(1);
      expect(transport.sendMessageCalls[0]).toBe(response);
      expect(transport.getPendingRequests().size).toBe(0);
    });

    it('resolves promise when successful response is received', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'success-test',
        method: 'test/method',
        params: { data: 'test' },
      };

      const sendPromise = transport.send(request);

      // Simulate successful response
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'success-test',
        result: { success: true, data: 'response-data' },
      };

      transport.testHandleMessage(response);

      await expect(sendPromise).resolves.toBeUndefined();
      expect(transport.getPendingRequests().has('success-test')).toBe(false);
    });

    it('rejects promise when error response is received', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'error-test',
        method: 'test/method',
        params: {},
      };

      const sendPromise = transport.send(request);

      // Simulate error response
      const errorResponse = {
        jsonrpc: '2.0' as const,
        id: 'error-test',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };

      transport.testHandleMessage(errorResponse);

      await expect(sendPromise).rejects.toThrow(
        'JSON-RPC error -32600: Invalid Request',
      );
      expect(transport.getPendingRequests().has('error-test')).toBe(false);
    });

    it('rejects promise on request timeout', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'timeout-test',
        method: 'test/method',
        params: {},
      };

      // Use short timeout for test
      const { transport: shortTimeoutTransport } = setupBaseClientTransportTest();
      shortTimeoutTransport['config'].timeout = 100;

      const sendPromise = shortTimeoutTransport.send(request);

      // Don't send response, let it timeout
      await expect(sendPromise).rejects.toThrow('Request timeout after 100ms');
      expect(
        shortTimeoutTransport.getPendingRequests().has('timeout-test'),
      ).toBe(false);
    });

    it('handles multiple concurrent requests correctly', async () => {
      const requests = [
        {
          jsonrpc: '2.0' as const,
          id: 'req-1',
          method: 'test/method1',
          params: {},
        },
        {
          jsonrpc: '2.0' as const,
          id: 'req-2',
          method: 'test/method2',
          params: {},
        },
        {
          jsonrpc: '2.0' as const,
          id: 'req-3',
          method: 'test/method3',
          params: {},
        },
      ];

      // Send all requests concurrently
      const sendPromises = requests.map((req) => transport.send(req));

      // Verify all are tracked
      expect(transport.getPendingRequests().size).toBe(3);

      // Respond to requests in different order
      const responses = [
        {
          jsonrpc: '2.0' as const,
          id: 'req-2',
          result: { success: true, request: 2 },
        },
        {
          jsonrpc: '2.0' as const,
          id: 'req-1',
          result: { success: true, request: 1 },
        },
        {
          jsonrpc: '2.0' as const,
          id: 'req-3',
          error: { code: -1, message: 'Test error' },
        },
      ];

      // Send responses
      responses.forEach((resp) => transport.testHandleMessage(resp));

      // Wait for all promises
      await expect(sendPromises[0]).resolves.toBeUndefined(); // req-1
      await expect(sendPromises[1]).resolves.toBeUndefined(); // req-2
      await expect(sendPromises[2]).rejects.toThrow(
        'JSON-RPC error -1: Test error',
      ); // req-3

      // All should be cleaned up
      expect(transport.getPendingRequests().size).toBe(0);
    });
  });
});
