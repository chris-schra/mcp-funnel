/**
 * Tests for MCPRegistryClient getServer method.
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

  describe('getServer', () => {
    it('should find server by exact name match using search', async () => {
      const serverDetail: ServerDetail = {
        id: 'test-server',
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: 'test-server-registry-id',
            published_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
        name: 'Test Server',
        description: 'Detailed test server information',
        packages: [
          {
            identifier: 'test-server',
            registry_type: 'npm',
            runtime_hint: 'node',
            package_arguments: ['--verbose'],
          },
        ],
        tools: ['tool1', 'tool2'],
      };

      // Mock search response since getServer uses search internally
      const mockSearchResponse = {
        servers: [serverDetail],
        metadata: {
          count: 1,
          next_cursor: null,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse,
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.getServer('Test Server');

      // Should use search endpoint for non-UUID identifiers (UUIDs use direct GET endpoint)
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/v0/servers?search=Test%20Server`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        }),
      );
      expect(result).toEqual(serverDetail);
    });

    it('should return null for non-existent server', async () => {
      const mockSearchResponse = {
        servers: [],
        metadata: {
          count: 0,
          next_cursor: null,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse,
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.getServer('nonexistent-server');
      expect(result).toBeNull();
    });

    it('should use cache when available for server details', async () => {
      const cachedServer: ServerDetail = {
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
      };

      // Pre-populate cache with correct cache key format: ${baseUrl}:server:${identifier}
      const cacheKey = `${mockBaseUrl}:server:cached-server`;
      await mockCache.set(cacheKey, cachedServer);

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);
      const result = await client.getServer('cached-server');

      // Should not make HTTP request when cache hit
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual(cachedServer);
    });

    it('should store server details in cache after fetch', async () => {
      const serverDetail: ServerDetail = {
        id: 'new-server',
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: 'new-server-registry-id',
            published_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
        name: 'New Server',
        description: 'Newly fetched server',
      };

      // getServer('new-server') is not a UUID, so it will use searchServers internally
      // Mock the search response format
      const mockSearchResponse = {
        servers: [serverDetail],
        metadata: {
          count: 1,
          next_cursor: null,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse,
      });

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);
      await client.getServer('New Server'); // Using exact name match

      // Verify server was cached with correct cache key format
      const cacheKey = `${mockBaseUrl}:server:New Server`;
      const cachedResult = await mockCache.get(cacheKey);
      expect(cachedResult).toEqual(serverDetail);
    });

    it('should throw on network errors for getServer', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);

      // Should throw the error for the calling layer to handle
      await expect(client.getServer('test-server')).rejects.toThrow(
        'Network error',
      );
    });

    it('should throw on 500 errors for getServer', async () => {
      // First mock is for the search call (for non-UUID)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);

      // Should throw error with status information
      // For non-UUID, it searches first which throws "Registry search failed"
      await expect(client.getServer('test-server')).rejects.toThrow(
        'Registry search failed: 500 Internal Server Error',
      );
    });
  });
});
