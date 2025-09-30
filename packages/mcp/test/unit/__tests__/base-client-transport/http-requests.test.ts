/**
 * Tests for HTTP request handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setupBaseClientTransportTest,
  TransportError,
  type JSONRPCRequest,
} from './test-utils.js';

describe('BaseClientTransport', () => {
  const { transport, mockAuthProvider, config, mockFetch } =
    setupBaseClientTransportTest();

  describe('HTTP Request Handling', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });
    });

    it('includes Content-Type header in HTTP requests', async () => {
      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      const controller = new AbortController();
      await transport.testExecuteHttpRequest(message, controller.signal);

      expect(mockFetch).toHaveBeenCalledWith(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
    });

    it('handles 401 responses with token refresh', async () => {
      // First call returns 401
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      const controller = new AbortController();
      await transport.testExecuteHttpRequest(message, controller.signal);

      expect(mockAuthProvider.refresh).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('handles token refresh failure on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      (mockAuthProvider.refresh as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Refresh failed'),
      );

      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      const controller = new AbortController();

      await expect(
        transport.testExecuteHttpRequest(message, controller.signal),
      ).rejects.toThrow(TransportError);
    });

    it('handles non-401 HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      const controller = new AbortController();

      await expect(
        transport.testExecuteHttpRequest(message, controller.signal),
      ).rejects.toThrow(TransportError);
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      const controller = new AbortController();

      await expect(
        transport.testExecuteHttpRequest(message, controller.signal),
      ).rejects.toThrow(TransportError);
    });

    it('handles request timeout', async () => {
      const abortError = new Error('Request timeout');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      const controller = new AbortController();

      await expect(
        transport.testExecuteHttpRequest(message, controller.signal),
      ).rejects.toThrow(TransportError);
    });
  });
});
