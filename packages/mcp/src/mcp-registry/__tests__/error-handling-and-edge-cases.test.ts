/**
 * Tests for MCPRegistryClient error handling and edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ServerDetail } from '../types/registry.types.js';
import { MCPRegistryClient } from '../registry-client.js';
import { MockCache, NoOpCache } from './test-utils.js';

describe('MCPRegistryClient', () => {
  const mockBaseUrl = 'https://registry.modelcontextprotocol.io';
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockCache: MockCache;
  let noOpCache: NoOpCache;

  beforeEach(() => {
    // Reset mocks before each test
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    mockCache = new MockCache();
    noOpCache = new NoOpCache();
  });

  describe('error handling and edge cases', () => {
    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);

      // Should throw JSON parsing errors to calling layer
      await expect(client.searchServers('test')).rejects.toThrow(
        'Invalid JSON',
      );
    });

    it('should handle empty responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => null,
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      // Should throw when receiving unexpected null response
      await expect(client.searchServers('test')).rejects.toThrow(
        "Cannot read properties of null (reading 'servers')",
      );
    });

    it('should properly encode query parameters', async () => {
      // Mock the API response format as the real API returns { servers: [], metadata: {} }
      const mockResponse = {
        servers: [],
        metadata: {
          count: 0,
          next_cursor: null,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      await client.searchServers('test query with spaces & special chars!');

      // Should properly encode query parameters
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/v0/servers?search=test%20query%20with%20spaces%20%26%20special%20chars!`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        }),
      );
    });

    it('should handle concurrent requests properly', async () => {
      const serverDetail: ServerDetail = {
        id: 'concurrent-server',
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: 'concurrent-server-registry-id',
            published_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
        name: 'Concurrent Server',
        description: 'Server for concurrency testing',
      };

      let _fetchCallCount = 0;
      mockFetch.mockImplementation(async () => {
        _fetchCallCount++;
        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          json: async () => ({
            servers: [serverDetail],
            metadata: {
              count: 1,
              next_cursor: null,
            },
          }),
        };
      });

      const _client = new MCPRegistryClient(mockBaseUrl, mockCache);

      const identifier = 'Concurrent Server';
      const requests = [
        _client.getServer(identifier),
        _client.getServer(identifier),
        _client.getServer(identifier),
      ];

      const results = await Promise.all(requests);

      // Dedup seam: concurrent callers share the in-flight request so transports can swap protocols later.
      expect(_fetchCallCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(3);
      results.forEach((result) => expect(result).toEqual(serverDetail));
    });
  });
});
