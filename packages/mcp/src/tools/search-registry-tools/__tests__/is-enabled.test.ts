import { describe, it, expect, vi } from 'vitest';
import { useTestContext, mockFetch } from './test-utils.js';

// Mock fetch globally
vi.stubGlobal('fetch', mockFetch);

describe('SearchRegistryTools', () => {
  const getContext = useTestContext();

  describe('isEnabled', () => {
    it('should be enabled when exposeCoreTools is not specified', () => {
      const { tool } = getContext();
      expect(tool.isEnabled({ servers: [] })).toBe(true);
    });

    it('should be disabled when exposeCoreTools is empty array', () => {
      const { tool } = getContext();
      expect(tool.isEnabled({ servers: [], exposeCoreTools: [] })).toBe(false);
    });

    it('should be enabled when exposeCoreTools includes tool name', () => {
      const { tool } = getContext();
      expect(
        tool.isEnabled({
          servers: [],
          exposeCoreTools: ['search_registry_tools'],
        }),
      ).toBe(true);
    });

    it('should be enabled when exposeCoreTools has matching pattern', () => {
      const { tool } = getContext();
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['search_*'] })).toBe(true);
    });

    it('should be enabled when exposeCoreTools is ["*"]', () => {
      const { tool } = getContext();
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['*'] })).toBe(true);
    });

    it('should be disabled when exposeCoreTools excludes the tool', () => {
      const { tool } = getContext();
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['other_tool'] })).toBe(false);
    });
  });
});
