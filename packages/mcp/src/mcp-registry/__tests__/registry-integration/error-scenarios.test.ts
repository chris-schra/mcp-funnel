/**
 * Tests for error scenarios in registry operations
 */

import { describe, it, expect } from 'vitest';
import { RegistryContext, setupRegistryIntegrationTest } from './test-utils.js';

describe('Registry Integration Tests', () => {
  const { mockProxyConfig, mockFetch } = setupRegistryIntegrationTest();

  describe('Error Scenarios', () => {
    it('should handle server not found gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [],
          metadata: { count: 0, next_cursor: null },
        }),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);
      const serverDetails = await context.getServerDetails(
        'non-existent-server',
      );

      expect(serverDetails).toBeNull();
    });

    it('should handle invalid registry ID gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [],
          metadata: { count: 0, next_cursor: null },
        }),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);
      const searchResult = await context.searchServers(
        'invalid-search-term-that-returns-nothing',
      );

      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toBe('No servers found');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const context = RegistryContext.getInstance(mockProxyConfig);

      const searchResult = await context.searchServers('test');
      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toContain('Registry errors');
    });

    it('should handle HTTP 500 errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      const searchResult = await context.searchServers('test');
      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toContain('Registry errors');
    });

    it('should handle HTTP 404 errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      const searchResult = await context.searchServers('test');
      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toContain('Registry errors');
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      const searchResult = await context.searchServers('test');
      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toContain('Registry errors');
    });
  });
});
