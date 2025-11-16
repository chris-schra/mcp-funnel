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

  describe('isEnabled', () => {
    it('should be enabled when exposeCoreTools is not specified', () => {
      expect(tool.isEnabled({ servers: [] })).toBe(true);
    });

    it('should be disabled when exposeCoreTools is empty array', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: [] })).toBe(false);
    });

    it('should be enabled when exposeCoreTools includes tool name', () => {
      expect(
        tool.isEnabled({
          servers: [],
          exposeCoreTools: ['get_server_install_info'],
        }),
      ).toBe(true);
    });

    it('should be enabled when exposeCoreTools has matching pattern', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['get_*'] })).toBe(true);
    });

    it('should be enabled when exposeCoreTools is ["*"]', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['*'] })).toBe(true);
    });

    it('should be disabled when exposeCoreTools excludes the tool', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['other_tool'] })).toBe(false);
    });
  });
});
