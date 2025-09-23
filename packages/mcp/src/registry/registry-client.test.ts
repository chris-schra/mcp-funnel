/**
 * Comprehensive tests for MCPRegistryClient.
 *
 * Tests the real MCP Registry API integration with proper endpoint structure.
 * Uses the actual implementation with mocked fetch calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ServerDetail } from './types/registry.types.js';
import type { IRegistryCache } from './interfaces/cache.interface.js';

// Import the actual implementation
import { MCPRegistryClient } from './registry-client.js';

/**
 * Mock cache implementation for testing.
 */
class MockCache implements IRegistryCache<unknown> {
  private storage = new Map<string, { value: unknown; expires?: number }>();

  async get(key: string): Promise<unknown | null> {
    const item = this.storage.get(key);
    if (!item) return null;
    if (item.expires && Date.now() > item.expires) {
      this.storage.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const expires = ttlMs ? Date.now() + ttlMs : undefined;
    this.storage.set(key, { value, expires });
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }
}

/**
 * No-op cache implementation for testing without cache.
 */
class NoOpCache implements IRegistryCache<unknown> {
  async get(): Promise<null> {
    return null;
  }

  async set(): Promise<void> {
    // No-op
  }

  async has(): Promise<boolean> {
    return false;
  }

  async delete(): Promise<void> {
    // No-op
  }

  async clear(): Promise<void> {
    // No-op
  }
}

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

  describe('constructor', () => {
    it('should accept baseUrl and optional cache', () => {
      const clientWithoutCache = new MCPRegistryClient(mockBaseUrl);
      expect(clientWithoutCache).toBeDefined();

      const clientWithCache = new MCPRegistryClient(mockBaseUrl, mockCache);
      expect(clientWithCache).toBeDefined();
    });

    it('should use provided baseUrl for API calls', () => {
      const customUrl = 'https://custom.registry.com';
      const client = new MCPRegistryClient(customUrl, mockCache);
      expect(client).toBeDefined();
      // The baseUrl will be used in actual API calls - verified in integration tests
    });
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

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);

      // Should not throw, but return empty array or handle gracefully
      await expect(client.searchServers('test')).resolves.toEqual([]);
    });

    it('should handle HTTP error responses gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);

      // Should handle HTTP errors gracefully
      await expect(client.searchServers('test')).resolves.toEqual([]);
    });
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

    it('should handle network errors gracefully for getServer', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);

      // Should return null on network error
      await expect(client.getServer('test-server')).resolves.toBeNull();
    });

    it('should handle 500 errors properly for getServer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);

      // Should return null on server error
      await expect(client.getServer('test-server')).resolves.toBeNull();
    });
  });

  describe('UUID detection and routing', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should detect and use direct GET endpoint for UUID format', async () => {
      const uuid = 'a8a5c761-c1dc-4d1d-9100-b57df4c9ec0d';
      const mockServer: ServerDetail = {
        id: uuid,
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: uuid,
            published_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
        name: 'test-server',
        description: 'Test server',
        packages: [
          {
            identifier: 'test-server',
            registry_type: 'npm',
          },
        ],
      };

      // Mock the direct GET endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockServer,
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.getServer(uuid);

      // Should call direct endpoint, not search
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/v0/servers/${uuid}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result).toEqual(mockServer);
    });

    it('should use search endpoint for non-UUID format', async () => {
      const name = 'github-mcp-server';
      const mockServer: ServerDetail = {
        id: 'github-server-id',
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: 'github-server-registry-id',
            published_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
        name: 'github-mcp-server',
        description: 'GitHub MCP Server',
        packages: [
          {
            identifier: 'github-mcp-server',
            registry_type: 'npm',
          },
        ],
      };
      const mockResults = [
        mockServer,
        {
          id: 'other-server-id',
          _meta: {
            'io.modelcontextprotocol.registry/official': {
              id: 'other-server-registry-id',
              published_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          },
          name: 'other-server',
          description: 'Other server',
        },
      ];

      // Mock the search endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ servers: mockResults }),
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.getServer(name);

      // Should call search endpoint, not direct GET
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/v0/servers?search=${encodeURIComponent(name)}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        }),
      );
      expect(result).toEqual(mockServer);
    });

    it('should handle 404 for UUID lookup', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';

      // Mock 404 response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.getServer(uuid);

      expect(result).toBeNull();
    });

    it('should detect UUIDs case-insensitively', async () => {
      const upperUuid = 'A8A5C761-C1DC-4D1D-9100-B57DF4C9EC0D';
      const mockServer: ServerDetail = {
        id: upperUuid.toLowerCase(),
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: upperUuid.toLowerCase(),
            published_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
        name: 'test-server',
        description: 'Test server with uppercase UUID',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockServer,
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      await client.getServer(upperUuid);

      // Should call direct endpoint with the UUID as provided (case preserved in URL)
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/v0/servers/${upperUuid}`,
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should handle malformed UUID-like strings via search', async () => {
      // UUID with invalid characters - should fall back to search
      const malformedId = 'a8a5c761-c1dc-4d1d-9100-g57df4c9ec0d';
      const mockResults: ServerDetail[] = [];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ servers: mockResults }),
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.getServer(malformedId);

      // Should use search endpoint for malformed UUID
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/v0/servers?search=${encodeURIComponent(malformedId)}`,
        expect.any(Object),
      );
      expect(result).toBeNull();
    });

    it('should handle UUID with missing hyphens via search', async () => {
      // UUID without hyphens - should fall back to search
      const nohyphensId = 'a8a5c761c1dc4d1d9100b57df4c9ec0d';
      const mockResults: ServerDetail[] = [];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ servers: mockResults }),
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.getServer(nohyphensId);

      // Should use search endpoint for non-hyphenated string
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/v0/servers?search=${encodeURIComponent(nohyphensId)}`,
        expect.any(Object),
      );
      expect(result).toBeNull();
    });

    it('should handle server errors on UUID direct endpoint', async () => {
      const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      // Mock 500 error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.getServer(uuid);

      // Implementation returns null for graceful degradation on HTTP errors
      expect(result).toBeNull();
    });
  });


  describe('cache behavior', () => {
    it('should respect cache TTL when implemented', async () => {
      const serverDetail: ServerDetail = {
        id: 'ttl-server',
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: 'ttl-server-registry-id',
            published_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
        name: 'TTL Server',
        description: 'Server for TTL testing',
      };

      // Set cache with short TTL using correct cache key format
      const cacheKey = `${mockBaseUrl}:server:TTL Server`;
      await mockCache.set(cacheKey, serverDetail, 100); // 100ms TTL

      const client = new MCPRegistryClient(mockBaseUrl, mockCache);

      // Should get from cache initially
      let result = await client.getServer('TTL Server');
      expect(result).toEqual(serverDetail);
      expect(mockFetch).not.toHaveBeenCalled();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Setup mock for after cache expiry - getServer uses search internally for non-UUID
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

      // Should fetch from API after TTL expiry
      result = await client.getServer('TTL Server');
      expect(result).toEqual(serverDetail);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/v0/servers?search=${encodeURIComponent('TTL Server')}`,
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });
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

      // Should handle JSON parsing errors gracefully
      await expect(client.searchServers('test')).resolves.toEqual([]);
    });

    it('should handle empty responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => null,
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);
      const result = await client.searchServers('test');
      expect(result).toEqual([]);
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
