import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RegistryContext } from '../../registry-context.js';
import {
  mockConfig,
  createEmptyRegistryResponse,
  createServerListResponse,
} from './test-utils.js';

// Mock external dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('RegistryContext', () => {
  beforeEach(() => {
    RegistryContext.reset();
    vi.clearAllMocks();
    // Set up default mock responses
    mockFetch.mockResolvedValue(createEmptyRegistryResponse());
  });

  afterEach(() => {
    RegistryContext.reset();
    vi.clearAllMocks();
  });

  describe('searchServers() method', () => {
    it('should aggregate results from multiple registries', async () => {
      // Mock successful registry response in the expected format
      mockFetch.mockResolvedValue(
        createServerListResponse([
          {
            name: 'filesystem-server',
            description: 'MCP server for filesystem operations',
            id: 'fs-001',
            registry_type: 'npm',
          },
        ]),
      );

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('filesystem');

      expect(result.found).toBe(true);
      expect(result.servers).toHaveLength(1);
      expect(result.servers?.[0]?.name).toBe('filesystem-server');
      expect(result.message).toContain('Found 1 server');
    });

    it('should handle errors from individual registries gracefully', async () => {
      // Mock registry error
      mockFetch.mockRejectedValue(new Error('Registry unavailable'));

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('error');

      expect(result.found).toBe(false);
      expect(result.servers).toHaveLength(0);
      expect(result.message).toContain('Registry unavailable');
    });

    it('should return empty array when no registries configured', async () => {
      // Test with a context that has no registries (this is tricky with real implementation)
      // In real implementation, we always have at least the default registry
      // But we can test the case where all registries fail
      mockFetch.mockRejectedValue(new Error('All registries unavailable'));

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('anything');

      expect(result.found).toBe(false);
      expect(result.servers).toHaveLength(0);
      expect(result.message).toContain('unavailable');
    });

    it('should handle no results found across all registries', async () => {
      // Mock empty response from registries
      mockFetch.mockResolvedValue(createEmptyRegistryResponse());

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('nonexistent');

      expect(result.found).toBe(false);
      expect(result.servers).toHaveLength(0);
      expect(result.message).toBe('No servers found');
    });

    it('should handle context initialization properly', async () => {
      // Real implementation is always initialized when getInstance succeeds
      // This test ensures no errors are thrown with proper initialization
      mockFetch.mockResolvedValue(createEmptyRegistryResponse());

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('test');

      expect(result).toBeDefined();
      expect(typeof result.found).toBe('boolean');
    });

    it('should accept optional registry parameter', async () => {
      mockFetch.mockResolvedValue(createEmptyRegistryResponse());

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('filesystem', 'example');

      expect(result).toBeDefined();
      expect(typeof result.found).toBe('boolean');
      expect(Array.isArray(result.servers)).toBe(true);
      expect(typeof result.message).toBe('string');
    });

    it('should filter by registry ID "official" mapping to official registry URL', async () => {
      mockFetch.mockResolvedValue(
        createServerListResponse([
          {
            name: 'official-server',
            description: 'Server from official registry',
            id: 'official-server',
            registry_type: 'official',
            tools: ['test_tool'],
            _meta: {
              'io.modelcontextprotocol.registry/official': {
                id: 'official-server',
              },
            },
          },
        ]),
      );

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('filesystem', 'official');

      expect(result.found).toBe(true);
      expect(result.servers).toHaveLength(1);
      expect(result.servers?.[0]?.name).toBe('official-server');
      // Verify the correct registry was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://registry.modelcontextprotocol.io'),
        expect.any(Object),
      );
    });

    it('should fallback to URL substring matching for unknown registry IDs', async () => {
      mockFetch.mockResolvedValue(createEmptyRegistryResponse());

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers(
        'filesystem',
        'modelcontextprotocol',
      );

      expect(result).toBeDefined();
      // Should still work because "modelcontextprotocol" is substring of URL
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://registry.modelcontextprotocol.io'),
        expect.any(Object),
      );
    });

    it('should return "no registry found" for unknown registry filter', async () => {
      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers(
        'filesystem',
        'nonexistent-registry',
      );

      expect(result.found).toBe(false);
      expect(result.servers).toEqual([]);
      expect(result.message).toBe(
        'No registry found matching: nonexistent-registry',
      );
      // Should not make any HTTP calls
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
