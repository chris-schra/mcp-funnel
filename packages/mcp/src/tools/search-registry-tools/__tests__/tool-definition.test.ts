import { describe, it, expect, vi } from 'vitest';
import { useTestContext, mockFetch } from './test-utils.js';

// Mock fetch globally
vi.stubGlobal('fetch', mockFetch);

describe('SearchRegistryTools', () => {
  const getContext = useTestContext();

  describe('Tool Definition', () => {
    it('should have correct name', () => {
      const { tool } = getContext();
      expect(tool.name).toBe('search_registry_tools');
    });

    it('should have proper description', () => {
      const { tool } = getContext();
      const toolDef = tool.tool;
      expect(toolDef.description).toContain('Search MCP registry');
      expect(toolDef.description).toContain('token efficiency');
    });

    it('should have valid input schema', () => {
      const { tool } = getContext();
      const toolDef = tool.tool;
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.required).toEqual(['keywords']);

      const properties = toolDef.inputSchema.properties as Record<
        string,
        Record<string, unknown>
      >;
      expect(properties?.keywords).toBeDefined();
      expect(properties?.keywords.type).toBe('string');
      expect(properties?.keywords.description).toContain('keywords');

      expect(properties?.registry).toBeDefined();
      expect(properties?.registry.type).toBe('string');
      expect(properties?.registry.optional).toBe(true);
    });

    it('should have required keywords parameter only', () => {
      const { tool } = getContext();
      const toolDef = tool.tool;
      expect(toolDef.inputSchema.required).toEqual(['keywords']);
      expect(toolDef.inputSchema.required).not.toContain('registry');
    });
  });
});