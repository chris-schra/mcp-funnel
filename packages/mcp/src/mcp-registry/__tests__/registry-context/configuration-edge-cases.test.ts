import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import { RegistryContext } from '../../registry-context.js';
import { createEmptyRegistryResponse } from './test-utils.js';

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

  describe('Configuration Edge Cases', () => {
    it('should handle malformed config gracefully', () => {
      const malformedConfig = {} as ProxyConfig;

      expect(() => RegistryContext.getInstance(malformedConfig)).not.toThrow();
    });

    it('should handle config with no servers', () => {
      const emptyConfig: ProxyConfig = { servers: [] };

      const context = RegistryContext.getInstance(emptyConfig);

      expect(context).toBeDefined();
    });

    it('should handle config with invalid registry URLs', () => {
      const invalidConfig: ProxyConfig = {
        servers: [
          {
            name: 'test',
            command: 'echo',
          },
        ],
      };

      expect(() => RegistryContext.getInstance(invalidConfig)).not.toThrow();
    });
  });
});
