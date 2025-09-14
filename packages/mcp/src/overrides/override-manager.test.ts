import { describe, it, expect } from 'vitest';
import { OverrideManager } from './override-manager.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

describe('OverrideManager', () => {
  it('should apply basic overrides to tool properties', () => {
    const overrides = {
      server__test_tool: {
        name: 'overridden_name',
        title: 'Overridden Title',
        description: 'Overridden description',
      },
    };

    const manager = new OverrideManager(overrides);

    const originalTool: Tool = {
      name: 'test_tool',
      description: 'Original description',
      inputSchema: {
        type: 'object',
        properties: {
          param1: { type: 'string' },
        },
      },
    };

    const result = manager.applyOverrides(originalTool, 'server__test_tool');

    expect(result.name).toBe('overridden_name');
    expect(result.title).toBe('Overridden Title');
    expect(result.description).toBe('Overridden description');
    expect(result.inputSchema).toEqual(originalTool.inputSchema);
  });

  it('should apply pattern-based overrides', () => {
    const overrides = {
      'github__*': {
        description: 'GitHub tool override',
      },
    };

    const manager = new OverrideManager(overrides);

    const originalTool: Tool = {
      name: 'create_issue',
      description: 'Original description',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    };

    const result = manager.applyOverrides(originalTool, 'github__create_issue');

    expect(result.description).toBe('GitHub tool override');
    expect(result.name).toBe('create_issue'); // unchanged
  });

  it('should merge input schema properties with merge strategy', () => {
    const overrides = {
      server__test_tool: {
        inputSchema: {
          strategy: 'merge' as const,
          properties: {
            newParam: { type: 'number', description: 'New parameter' },
          },
          required: ['newParam'],
        },
      },
    };

    const manager = new OverrideManager(overrides);

    const originalTool: Tool = {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {
          oldParam: { type: 'string', description: 'Old parameter' },
        },
        required: ['oldParam'],
      },
    };

    const result = manager.applyOverrides(originalTool, 'server__test_tool');

    expect(result.inputSchema?.properties).toEqual({
      oldParam: { type: 'string', description: 'Old parameter' },
      newParam: { type: 'number', description: 'New parameter' },
    });
    expect(result.inputSchema?.required).toEqual(['newParam']);
  });

  it('should replace input schema with replace strategy', () => {
    const overrides = {
      server__test_tool: {
        inputSchema: {
          strategy: 'replace' as const,
          properties: {
            newParam: { type: 'number' },
          },
          required: ['newParam'],
        },
      },
    };

    const manager = new OverrideManager(overrides);

    const originalTool: Tool = {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {
          oldParam: { type: 'string' },
        },
        required: ['oldParam'],
      },
    };

    const result = manager.applyOverrides(originalTool, 'server__test_tool');

    expect(result.inputSchema?.properties).toEqual({
      newParam: { type: 'number' },
    });
    expect(result.inputSchema?.required).toEqual(['newParam']);
  });

  it('should return original tool when no override matches', () => {
    const manager = new OverrideManager({});

    const originalTool: Tool = {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    };

    const result = manager.applyOverrides(originalTool, 'server__test_tool');

    expect(result).toEqual(originalTool);
  });

  it('should deep merge input schema properties with deep-merge strategy', () => {
    const overrides = {
      server__test_tool: {
        inputSchema: {
          strategy: 'deep-merge' as const,
          properties: {
            existingParam: {
              description: 'Updated description',
              default: 'new default',
            },
            newParam: { type: 'number' },
          },
        },
      },
    };

    const manager = new OverrideManager(overrides);

    const originalTool: Tool = {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {
          existingParam: {
            type: 'string',
            description: 'Original description',
          },
          oldParam: { type: 'boolean' },
        },
        required: ['existingParam'],
      },
    };

    const result = manager.applyOverrides(originalTool, 'server__test_tool');

    expect(result.inputSchema?.properties?.existingParam).toEqual({
      type: 'string',
      description: 'Updated description',
      default: 'new default',
    });
    expect(result.inputSchema?.properties?.newParam).toEqual({
      type: 'number',
    });
    expect(result.inputSchema?.properties?.oldParam).toEqual({
      type: 'boolean',
    });
    expect(result.inputSchema?.required).toEqual(['existingParam']);
  });

  it('should apply annotations', () => {
    const overrides = {
      server__test_tool: {
        annotations: {
          category: 'test',
          tags: ['experimental'],
          deprecated: true,
          deprecationMessage: 'Use new tool instead',
        },
      },
    };

    const manager = new OverrideManager(overrides);

    const originalTool: Tool = {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    };

    const result = manager.applyOverrides(originalTool, 'server__test_tool');

    expect(result._meta?.annotations).toEqual({
      category: 'test',
      tags: ['experimental'],
      deprecated: true,
      deprecationMessage: 'Use new tool instead',
    });
  });
});
