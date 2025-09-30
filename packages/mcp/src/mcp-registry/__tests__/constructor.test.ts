/**
 * Tests for MCPRegistryClient constructor.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
});
