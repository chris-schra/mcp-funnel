import { describe, it, expect } from 'vitest';
import { LoadToolset } from '../index.js';

describe('LoadToolset', () => {
  describe('tool definition', () => {
    it('should have correct name', () => {
      const loadToolset = new LoadToolset();
      expect(loadToolset.name).toBe('load_toolset');
    });

    it('should have correct input schema with mutual exclusivity', () => {
      const loadToolset = new LoadToolset();
      const tool = loadToolset.tool;
      expect(tool.name).toBe('load_toolset');
      expect(tool.inputSchema).toBeDefined();

      if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
        throw new Error('inputSchema is not defined or not an object');
      }

      const schema = tool.inputSchema;
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('properties');

      if (!('properties' in schema) || typeof schema.properties !== 'object') {
        throw new Error('properties is not defined or not an object');
      }

      // Check both properties exist
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('tools');

      // Schema doesn't use oneOf anymore due to MCP limitations
      // Mutual exclusivity is enforced in the handler
      expect(schema).not.toHaveProperty('oneOf');
    });
  });
});
