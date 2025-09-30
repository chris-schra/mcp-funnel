import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockFetch, createMockPackageResponse } from './test-utils.js';
import { NPMClient } from '../../npm-client.js';
import type { NPMSearchResponse } from '../../types.js';

describe('NPMClient', () => {
  const mockPackageResponse = createMockPackageResponse();

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  describe('cache TTL configuration', () => {
    it('should use default 5-minute TTL when no options provided', async () => {
      const defaultClient = new NPMClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      await defaultClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache (within 5 minutes)
      await defaultClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use custom TTL when provided in options', async () => {
      const customTTL = 10 * 60 * 1000; // 10 minutes
      const customClient = new NPMClient({ cacheTTL: customTTL });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      await customClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await customClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should apply custom TTL to both package and search caches', async () => {
      const customTTL = 1000; // 1 second for testing
      const customClient = new NPMClient({ cacheTTL: customTTL });

      // Test package cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      await customClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Test search cache
      const mockSearchResponse: NPMSearchResponse = {
        objects: [],
        total: 0,
        time: 'Wed Jan 01 2025 00:00:00 GMT+0000 (UTC)',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      await customClient.searchPackages('react');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Both should use cache for immediate calls
      await customClient.getPackage('react');
      await customClient.searchPackages('react');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Mock new responses for expired cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      // After expiration, should make new calls
      await customClient.getPackage('react');
      await customClient.searchPackages('react');
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should handle very short TTL as near-immediate cache expiration', async () => {
      const shortTTLClient = new NPMClient({ cacheTTL: 1 }); // 1ms TTL

      // Mock different responses to verify each call is made
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockPackageResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockPackageResponse,
        });

      // With 1ms TTL, cache should expire very quickly
      await shortTTLClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 5));

      await shortTTLClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle very large TTL values', async () => {
      const largeTTL = 24 * 60 * 60 * 1000; // 24 hours
      const largeClient = new NPMClient({ cacheTTL: largeTTL });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      await largeClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should still use cache for subsequent calls
      await largeClient.getPackage('react');
      await largeClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
