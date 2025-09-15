import { describe, it, expect, vi } from 'vitest';
import { OverrideManager } from '../override-manager.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

describe('OverrideManager', () => {
  it('should apply exact match overrides', () => {
    const manager = new OverrideManager({
      github__create_issue: {
        description: 'Custom description',
      },
    });

    const tool: Tool = {
      name: 'create_issue',
      description: 'Original description',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    };

    const result = manager.applyOverrides(tool, 'github__create_issue');
    expect(result.description).toBe('Custom description');
  });

  it('should apply pattern-based overrides', () => {
    const manager = new OverrideManager({
      'github__list_*': {
        annotations: { category: 'query' },
      },
    });

    const tool: Tool = {
      name: 'list_issues',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    };
    const result = manager.applyOverrides(tool, 'github__list_issues');
    expect((result._meta?.annotations as { category?: string })?.category).toBe(
      'query',
    );
  });

  it('should handle input schema merging with merge strategy', () => {
    const manager = new OverrideManager({
      test__tool: {
        inputSchema: {
          strategy: 'merge',
          properties: {
            newProp: { type: 'string', description: 'New property' },
          },
        },
      },
    });

    const tool: Tool = {
      name: 'tool',
      inputSchema: {
        type: 'object' as const,
        properties: {
          existingProp: { type: 'number' },
        },
        required: ['existingProp'],
      },
    };

    const result = manager.applyOverrides(tool, 'test__tool');
    expect(result.inputSchema?.properties).toHaveProperty('existingProp');
    expect(result.inputSchema?.properties).toHaveProperty('newProp');
    expect(result.inputSchema?.required).toEqual(['existingProp']);
  });

  it('should not modify tool when no override matches', () => {
    const manager = new OverrideManager({
      other__tool: {
        description: 'Other description',
      },
    });

    const tool: Tool = {
      name: 'test',
      description: 'Original',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    };

    const result = manager.applyOverrides(tool, 'test__test');
    expect(result).toEqual(tool);
  });

  it('should support renaming tools via name override', () => {
    const manager = new OverrideManager({
      memory__check_embedding_mode: {
        name: 'memory__check',
        description: 'Check memory system status (renamed for simplicity)',
      },
    });

    const tool: Tool = {
      name: 'check_embedding_mode',
      description: 'Check the current embedding mode configuration',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    };

    const result = manager.applyOverrides(tool, 'memory__check_embedding_mode');
    expect(result.name).toBe('memory__check');
    expect(result.description).toBe(
      'Check memory system status (renamed for simplicity)',
    );
    expect(result.inputSchema).toEqual(tool.inputSchema);
  });

  it('should perform deep merging with deep-merge strategy for nested properties', () => {
    // This test bypasses Zod validation by creating the override manager
    // with a direct object rather than going through the schema validation
    const manager = new OverrideManager({
      test__deep_merge: {
        inputSchema: {
          strategy: 'deep-merge',
          properties: {
            config: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    port: { type: 'number', default: 5432 },
                    ssl: { type: 'boolean', default: true },
                  },
                },
                cache: {
                  type: 'object',
                  properties: {
                    ttl: { type: 'number', default: 3600 },
                  },
                },
              },
            },
            newTopLevel: {
              type: 'string',
              description: 'New top-level property',
            },
          },
        },
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Bypass type checking to test the deep merge functionality
    });

    const tool: Tool = {
      name: 'deep_merge',
      inputSchema: {
        type: 'object' as const,
        properties: {
          config: {
            type: 'object',
            properties: {
              database: {
                type: 'object',
                properties: {
                  host: { type: 'string', default: 'localhost' },
                  port: { type: 'number', default: 3000 },
                },
              },
              logging: {
                type: 'object',
                properties: {
                  level: { type: 'string', default: 'info' },
                },
              },
            },
          },
          existingTopLevel: { type: 'boolean', default: false },
        },
        required: ['config'],
      },
    };

    const result = manager.applyOverrides(tool, 'test__deep_merge');
    const resultProps = result.inputSchema?.properties;

    if (!resultProps) {
      throw new Error('Result properties should be defined');
    }

    // Verify top-level properties are merged correctly
    expect(resultProps).toHaveProperty('config');
    expect(resultProps).toHaveProperty('existingTopLevel');
    expect(resultProps).toHaveProperty('newTopLevel');

    const newTopLevel = resultProps.newTopLevel as Record<string, unknown>;
    expect(newTopLevel.description).toBe('New top-level property');

    // Verify deep nested merging in config object
    const config = resultProps.config as Record<string, unknown>;
    const configProps = config.properties as Record<string, unknown>;
    expect(configProps).toHaveProperty('database');
    expect(configProps).toHaveProperty('logging');
    expect(configProps).toHaveProperty('cache');

    // Verify database properties are deeply merged (not replaced)
    const database = configProps.database as Record<string, unknown>;
    const databaseProps = database.properties as Record<string, unknown>;
    expect(databaseProps).toHaveProperty('host'); // From original
    expect(databaseProps).toHaveProperty('port'); // From override (should override original)
    expect(databaseProps).toHaveProperty('ssl'); // From override (new)

    const host = databaseProps.host as Record<string, unknown>;
    const port = databaseProps.port as Record<string, unknown>;
    const ssl = databaseProps.ssl as Record<string, unknown>;
    expect(host.default).toBe('localhost'); // Original value preserved
    expect(port.default).toBe(5432); // Override value used
    expect(ssl.default).toBe(true); // New property from override

    // Verify logging properties are preserved from original
    const logging = configProps.logging as Record<string, unknown>;
    const loggingProps = logging.properties as Record<string, unknown>;
    expect(loggingProps).toHaveProperty('level');

    const level = loggingProps.level as Record<string, unknown>;
    expect(level.default).toBe('info');

    // Verify cache properties are added from override
    const cache = configProps.cache as Record<string, unknown>;
    const cacheProps = cache.properties as Record<string, unknown>;
    expect(cacheProps).toHaveProperty('ttl');

    const ttl = cacheProps.ttl as Record<string, unknown>;
    expect(ttl.default).toBe(3600);

    // Verify required array is preserved
    expect(result.inputSchema?.required).toEqual(['config']);
  });

  it('should handle circular references in deep merge gracefully', () => {
    const manager = new OverrideManager({
      test__circular: {
        inputSchema: {
          strategy: 'deep-merge',
          properties: {
            config: {
              type: 'object',
              properties: {
                nested: {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Bypass type checking for this test
    });

    // Create circular reference in the original tool
    const nestedObj: Record<string, unknown> = {
      type: 'object',
      properties: {} as Record<string, unknown>,
    };
    (nestedObj.properties as Record<string, unknown>).self = nestedObj; // Circular reference

    const tool: Tool = {
      name: 'circular',
      inputSchema: {
        type: 'object' as const,
        properties: {
          config: {
            type: 'object',
            properties: {
              nested: nestedObj,
            },
          },
        },
      },
    };

    // This should not throw an error and should handle the circular reference
    const result = manager.applyOverrides(tool, 'test__circular');
    expect(result).toBeDefined();
    expect(result.inputSchema?.properties).toHaveProperty('config');
  });

  it('should detect and warn about conflicting patterns', () => {
    // Mock console.warn to capture warning messages
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create overrides with conflicting patterns that would both match 'github__example_tool'
    new OverrideManager({
      'github__*': {
        description: 'First pattern override',
      },
      '*__example_tool': {
        description: 'Second pattern override',
      },
    });

    // Verify that console.warn was called with pattern conflict warning
    expect(consoleSpy).toHaveBeenCalledWith(
      '[OverrideManager] Pattern conflicts detected:',
      expect.arrayContaining([
        expect.stringContaining(
          "Patterns 'github__*' and '*__example_tool' may conflict",
        ),
      ]),
    );

    // Restore the original console.warn
    consoleSpy.mockRestore();
  });

  it('should not warn when patterns do not conflict', () => {
    // Mock console.warn to capture warning messages
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create overrides with non-conflicting patterns
    new OverrideManager({
      'github__list_*': {
        description: 'GitHub list tools',
      },
      'memory__store_*': {
        description: 'Memory store tools',
      },
    });

    // Verify that console.warn was not called for pattern conflicts
    expect(consoleSpy).not.toHaveBeenCalled();

    // Restore the original console.warn
    consoleSpy.mockRestore();
  });
});
