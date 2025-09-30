import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RegistryContext } from '../../registry-context.js';
import {
  mockConfig,
  createServerListResponse,
  createMockFetchResponse,
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
    mockFetch.mockResolvedValue(
      createMockFetchResponse({
        servers: [],
        metadata: {
          count: 0,
          next_cursor: null,
        },
      }),
    );
  });

  afterEach(() => {
    RegistryContext.reset();
    vi.clearAllMocks();
  });

  describe('getServerDetails() method', () => {
    it('should try each registry until server found', async () => {
      // Mock search response that includes our server (getServer searches by name)
      mockFetch.mockResolvedValue(
        createServerListResponse([
          {
            name: 'fs-001',
            description: 'MCP server for filesystem operations',
            id: 'fs-001',
            registry_type: 'npm',
            tools: ['read_file', 'write_file', 'list_directory'],
          },
        ]),
      );

      const context = RegistryContext.getInstance(mockConfig);
      const details = await context.getServerDetails('fs-001');

      expect(details).not.toBeNull();
      expect(details?.name).toBe('fs-001');
      expect(details?.tools).toContain('read_file');
    });

    it('should return null if server not found in any registry', async () => {
      // Mock 404 response
      mockFetch.mockResolvedValue(
        createMockFetchResponse({}, false, 404, 'Not Found'),
      );

      const context = RegistryContext.getInstance(mockConfig);
      const details = await context.getServerDetails('nonexistent-server');

      expect(details).toBeNull();
    });

    it('should continue to next registry on error', async () => {
      // Mock registry error
      mockFetch.mockRejectedValue(new Error('Server details unavailable'));

      const context = RegistryContext.getInstance(mockConfig);
      const details = await context.getServerDetails('error-server');

      expect(details).toBeNull();
    });

    it('should handle context initialization properly for getServerDetails', async () => {
      // Real implementation is always initialized when getInstance succeeds
      mockFetch.mockResolvedValue(
        createMockFetchResponse({}, false, 404, 'Not Found'),
      );

      const context = RegistryContext.getInstance(mockConfig);
      const result = await context.getServerDetails('test');

      expect(result).toBeNull(); // Not found is expected behavior
    });
  });
});
