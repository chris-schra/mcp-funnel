import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RegistryContext } from '../../registry-context.js';
import { mockConfig, createEmptyRegistryResponse } from './test-utils.js';

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

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      // Mock network timeout
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.searchServers('test');

      expect(result.found).toBe(false);
      expect(result.message).toContain('Network timeout');
    });

    it('should handle invalid registry responses', async () => {
      // Mock invalid JSON response
      mockFetch.mockRejectedValue(new Error('Invalid JSON response'));

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.getServerDetails('test-server');

      expect(result).toBeNull();
    });

    it('should handle concurrent requests safely', async () => {
      // Mock successful responses
      mockFetch.mockResolvedValue(createEmptyRegistryResponse());

      const context = RegistryContext.getInstance(mockConfig);

      // Test concurrent access
      const promises = [
        context.searchServers('filesystem'),
        context.searchServers('filesystem'),
        context.getServerDetails('fs-001'),
        context.getServerDetails('fs-001'),
      ];

      const results = await Promise.all(promises);

      // All requests should complete successfully
      expect(results).toHaveLength(4);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });
});
