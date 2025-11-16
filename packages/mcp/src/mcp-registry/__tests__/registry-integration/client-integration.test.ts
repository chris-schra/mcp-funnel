/**
 * Tests for integration with MCPRegistryClient
 */

import { describe, it, expect } from 'vitest';
import {
  MCPRegistryClient,
  setupRegistryIntegrationTest,
  type ServerDetail,
} from './test-utils.js';

describe('Registry Integration Tests', () => {
  const { mockFetch } = setupRegistryIntegrationTest();

  describe('Integration with MCPRegistryClient', () => {
    it('should properly integrate client search with context aggregation', async () => {
      const mockServers: ServerDetail[] = [
        {
          id: 'client-server-1',
          _meta: {
            'io.modelcontextprotocol.registry/official': {
              id: 'client-registry-1',
              published_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          },
          name: 'Client Server 1',
          description: 'First server from client',
          packages: [{ identifier: 'client-pkg-1', registry_type: 'npm' }],
        },
        {
          id: 'client-server-2',
          _meta: {
            'io.modelcontextprotocol.registry/official': {
              id: 'client-registry-2',
              published_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          },
          name: 'Client Server 2',
          description: 'Second server from client',
          remotes: [{ type: 'sse', url: 'https://example.com/sse' }],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: mockServers,
          metadata: { count: 2, next_cursor: null },
        }),
      });

      const client = new MCPRegistryClient('https://registry.modelcontextprotocol.io');
      const servers = await client.searchServers('client test');

      expect(servers).toHaveLength(2);
      expect(servers[0].name).toBe('Client Server 1');
      expect(servers[1].name).toBe('Client Server 2');

      // Verify the client properly handles the real API response format
      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.modelcontextprotocol.io/v0/servers?search=client%20test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        }),
      );
    });
  });
});
