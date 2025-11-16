/**
 * Tests for MCPRegistryClient UUID detection and routing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ServerDetail } from '../types/registry.types.js';
import { MCPRegistryClient } from '../registry-client.js';
import { NoOpCache } from './test-utils.js';

describe('MCPRegistryClient', () => {
  const mockBaseUrl = 'https://registry.modelcontextprotocol.io';
  let mockFetch: ReturnType<typeof vi.fn>;
  let noOpCache: NoOpCache;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks before each test
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    noOpCache = new NoOpCache();
  });

  describe('UUID detection and routing', () => {
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

    it('should throw on server errors for UUID direct endpoint', async () => {
      const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      // Mock 500 error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new MCPRegistryClient(mockBaseUrl, noOpCache);

      // Should throw error for non-404 HTTP errors
      await expect(client.getServer(uuid)).rejects.toThrow(
        'Registry server fetch failed: 500 Internal Server Error',
      );
    });
  });
});
