/**
 * Tests for MCPRegistryClient searchServers method.
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

  describe('searchServers', () => {
    it('should make correct API call to registry search endpoint', async () => {
      const mockServers: ServerDetail[] = [
        {
          id: 'test-server-1',
          _meta: {
            'io.modelcontextprotocol.registry/official': {
              id: 'test-server-1-registry-id',
              published_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          },
          name: 'Test Server 1',
          description: 'A test server for demonstration',
          packages: [
            {
              identifier: 'test-server-1',
              registry_type: 'npm',
            },
          ],
        },
      ];

      // Mock the real API response format: { servers: [], metadata: {} }
      const mockResponse = {
        servers: mockServers,
        metadata: {
          count: 1,
          next_cursor: null,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.searchServers('test query');

      // Verify correct endpoint and format
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/v0/servers?search=test%20query`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        }),
      );
      expect(result).toEqual(mockServers);
    });

    it('should return empty array when no servers found', async () => {
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
      const result = await client.searchServers('nonexistent');
      expect(result).toEqual([]);
    });

    it('should use cache when available (cache hit)', async () => {
      const cachedResults: ServerDetail[] = [
        {
          id: 'cached-server',
          _meta: {
            'io.modelcontextprotocol.registry/official': {
              id: 'cached-server-registry-id',
              published_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          },
          name: 'Cached Server',
          description: 'Server from cache',
        },
      ];

      // Pre-populate cache with correct cache key format: ${baseUrl}:search:${keywords}
      const cacheKey = `${mockBaseUrl}:search:test query`;
      await mockCache.set(cacheKey, cachedResults);

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);
      const result = await client.searchServers('test query');

      // Should not make HTTP request when cache hit
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual(cachedResults);
    });

    it('should store results in cache after successful fetch', async () => {
      const fetchResults: ServerDetail[] = [
        {
          id: 'fetched-server',
          _meta: {
            'io.modelcontextprotocol.registry/official': {
              id: 'fetched-server-registry-id',
              published_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          },
          name: 'Fetched Server',
          description: 'Server from API',
        },
      ];

      // Mock the API response format as the real API returns { servers: [], metadata: {} }
      const mockResponse = {
        servers: fetchResults,
        metadata: {
          count: 1,
          next_cursor: null,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);
      await client.searchServers('new query');

      // Verify results were cached with correct cache key format
      const cacheKey = `${mockBaseUrl}:search:new query`;
      const cachedResult = await mockCache.get(cacheKey);
      expect(cachedResult).toEqual(fetchResults);
    });

    it('should throw on network errors', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValueOnce(networkError);

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);

      // Should throw the error for the calling layer to handle
      await expect(client.searchServers('test')).rejects.toThrow('Network error');
    });

    it('should throw on HTTP error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);

      // Should throw error with status information
      await expect(client.searchServers('test')).rejects.toThrow(
        'Registry search failed: 500 Internal Server Error',
      );
    });
  });
});
