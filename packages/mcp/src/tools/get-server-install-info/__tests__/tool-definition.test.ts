import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetServerInstallInfo } from '../index.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GetServerInstallInfo', () => {
  let tool: GetServerInstallInfo;

  beforeEach(() => {
    tool = new GetServerInstallInfo();

    // Reset mocks
    vi.clearAllMocks();

    // Default mock implementation
    mockFetch.mockImplementation(async (url: string) => {
      // Handle direct server fetch by ID (UUID pattern)
      if (url.includes('/v0/servers/') && !url.includes('search=')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
        };
      }

      // Handle search endpoint
      if (url.includes('/v0/servers?search=')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            servers: [],
            metadata: {
              count: 0,
              next_cursor: null,
            },
          }),
        };
      }

      throw new Error(`Unmocked fetch request: ${url}`);
    });
  });

  describe('Tool Definition', () => {
    it('should have correct name and schema', () => {
      expect(tool.name).toBe('get_server_install_info');

      const toolDef = tool.tool;
      expect(toolDef.name).toBe('get_server_install_info');
      expect(toolDef.description).toContain('Get installation instructions');
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.required).toEqual(['registryId']);

      const properties = toolDef.inputSchema.properties as Record<
        string,
        { type: string; description: string }
      >;
      expect(properties.registryId).toBeDefined();
      expect(properties.registryId.type).toBe('string');
      expect(properties.registryId.description).toContain('registry identifier');
    });
  });
});
