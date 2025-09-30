import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProxyConfig } from '@mcp-funnel/schemas';
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

  describe('Registry Client Initialization', () => {
    it('should create clients for each registry URL in config', () => {
      const context = RegistryContext.getInstance(mockConfig);

      // Verify the context is properly initialized
      expect(context).toBeDefined();
      expect(context.hasRegistries()).toBe(true);
    });

    it('should handle empty registry list gracefully', () => {
      const emptyConfig: ProxyConfig = { servers: [] };
      const context = RegistryContext.getInstance(emptyConfig);

      expect(context).toBeDefined();
      expect(context.hasRegistries()).toBe(true); // Should have default registry
    });

    it('should initialize with multiple registry URLs', () => {
      const configWithRegistries = {
        ...mockConfig,
        registries: [
          'https://registry.example.com/api',
          'https://backup-registry.example.com/api',
        ],
      } as ProxyConfig & { registries: string[] };

      const context = RegistryContext.getInstance(configWithRegistries);

      // Verify multiple registries are configured
      expect(context.hasRegistries()).toBe(true);
    });
  });
});
