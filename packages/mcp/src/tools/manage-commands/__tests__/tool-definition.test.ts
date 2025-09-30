import { describe, it, expect } from 'vitest';
import { useTestContext, type SchemaProperty } from './test-utils.js';

// Mock readManifest
import { vi } from 'vitest';
vi.mock('@mcp-funnel/commands-core', async () => {
  const actual = await vi.importActual('@mcp-funnel/commands-core');
  return {
    ...actual,
    readManifest: vi.fn(),
  };
});

describe('ManageCommands', () => {
  const getContext = useTestContext();

  describe('Tool Definition', () => {
    it('should have correct name and schema', () => {
      const { tool } = getContext();
      expect(tool.name).toBe('manage_commands');

      const toolDef = tool.tool;
      expect(toolDef.name).toBe('manage_commands');
      expect(toolDef.description).toContain('Manage MCP Funnel commands');
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.required).toEqual(['action', 'package']);

      const properties = toolDef.inputSchema.properties as Record<
        string,
        SchemaProperty
      >;

      expect(properties.action).toBeDefined();
      expect(properties.action.type).toBe('string');
      expect(properties.action.enum).toEqual([
        'install',
        'uninstall',
        'update',
      ]);

      expect(properties.package).toBeDefined();
      expect(properties.package.type).toBe('string');
      expect(properties.package.description).toContain('NPM package name');

      expect(properties.version).toBeDefined();
      expect(properties.version.description).toContain(
        'Specific version to install',
      );

      expect(properties.force).toBeDefined();
      expect(properties.force.type).toBe('boolean');
      expect(properties.force.default).toBe(false);

      expect(properties.removeData).toBeDefined();
      expect(properties.removeData.type).toBe('boolean');
      expect(properties.removeData.default).toBe(false);
    });
  });
});
