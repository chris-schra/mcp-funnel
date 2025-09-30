/**
 * Tests for MCPRegistryClient cache behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ServerDetail } from '../types/registry.types.js';
import { MCPRegistryClient } from '../registry-client.js';
import { MockCache } from './test-utils.js';

describe('MCPRegistryClient', () => {
  const mockBaseUrl = 'https://registry.modelcontextprotocol.io';
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockCache: MockCache;

  beforeEach(() => {
    // Reset mocks before each test
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    mockCache = new MockCache();
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
});
