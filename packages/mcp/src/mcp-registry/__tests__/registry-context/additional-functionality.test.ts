import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RegistryServer } from '../../index.js';
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

  describe('Additional Functionality', () => {
    it('should provide server config generation', async () => {
      const mockServer: RegistryServer = {
        name: 'test-server',
        description: 'Test server',
        id: 'test-001',
        registry_type: 'npm',
        tools: ['test_tool'],
      };

      const context = RegistryContext.getInstance(mockConfig);
      const config = await context.generateServerConfig(mockServer);

      expect(config).toBeDefined();
      expect(config.name).toBe('test-server');
    });

    it('should provide install info generation', async () => {
      const mockServer: RegistryServer = {
        name: 'test-server',
        description: 'Test server',
        id: 'test-001',
        registry_type: 'npm',
        tools: ['test_tool'],
      };

      const context = RegistryContext.getInstance(mockConfig);
      const installInfo = await context.generateInstallInfo(mockServer);

      expect(installInfo).toBeDefined();
      expect(installInfo.name).toBe('test-server');
      expect(installInfo.configSnippet).toBeDefined();
      expect(installInfo.installInstructions).toBeDefined();
    });

    it('should check if registries are available', () => {
      const context = RegistryContext.getInstance(mockConfig);

      expect(context.hasRegistries()).toBe(true);
    });
  });
});
