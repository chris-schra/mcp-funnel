import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTest, cleanupTest, type TestFixture } from './test/utils.js';

// Type for schema properties used in tool definition tests
type SchemaProperty = {
  type: string;
  enum?: string[];
  description: string;
  default?: unknown;
};

describe('ManageCommands', () => {
  let fixture: TestFixture;

  beforeEach(async () => {
    fixture = await setupTest();
  });

  afterEach(async () => {
    await cleanupTest(fixture);
  });

  describe('Tool Definition', () => {
    it('should have correct name and schema', () => {
      expect(fixture.tool.name).toBe('manage_commands');

      const toolDef = fixture.tool.tool;
      expect(toolDef.name).toBe('manage_commands');
      expect(toolDef.description).toContain('Manage MCP Funnel commands');
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.required).toEqual(['action', 'package']);

      const properties = toolDef.inputSchema.properties as Record<string, SchemaProperty>;

      expect(properties.action).toBeDefined();
      expect(properties.action.type).toBe('string');
      expect(properties.action.enum).toEqual(['install', 'uninstall', 'update']);

      expect(properties.package).toBeDefined();
      expect(properties.package.type).toBe('string');
      expect(properties.package.description).toContain('NPM package name');

      expect(properties.version).toBeDefined();
      expect(properties.version.description).toContain('Specific version to install');

      expect(properties.force).toBeDefined();
      expect(properties.force.type).toBe('boolean');
      expect(properties.force.default).toBe(false);

      expect(properties.removeData).toBeDefined();
      expect(properties.removeData.type).toBe('boolean');
      expect(properties.removeData.default).toBe(false);
    });
  });
});
