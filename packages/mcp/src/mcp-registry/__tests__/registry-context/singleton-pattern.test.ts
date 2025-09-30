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

  describe('Singleton Pattern', () => {
    it('should return same instance on subsequent calls', () => {
      const instance1 = RegistryContext.getInstance(mockConfig);
      const instance2 = RegistryContext.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should require config on first access', () => {
      expect(() => RegistryContext.getInstance()).toThrow(
        'RegistryContext must be initialized with config on first access',
      );
    });

    it('should throw error if no config provided on first access', () => {
      expect(() => RegistryContext.getInstance()).toThrow();
    });

    it('should allow reset of singleton instance', () => {
      const instance1 = RegistryContext.getInstance(mockConfig);
      RegistryContext.reset();

      // Should require config again after reset
      expect(() => RegistryContext.getInstance()).toThrow(
        'RegistryContext must be initialized with config on first access',
      );

      const instance2 = RegistryContext.getInstance(mockConfig);
      expect(instance1).not.toBe(instance2);
    });

    it('should not require config after first initialization', () => {
      RegistryContext.getInstance(mockConfig);

      // Should not throw on subsequent calls without config
      expect(() => RegistryContext.getInstance()).not.toThrow();
    });
  });
});
