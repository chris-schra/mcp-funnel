import { describe, it, expect } from 'vitest';
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
});
