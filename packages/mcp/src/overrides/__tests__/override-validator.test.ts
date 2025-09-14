import { describe, it, expect } from 'vitest';
import { OverrideValidator } from '../override-validator.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

describe('OverrideValidator', () => {
  it('should warn when removing required parameters', () => {
    const validator = new OverrideValidator();

    const originalTool: Tool = {
      name: 'test_tool',
      inputSchema: {
        type: 'object' as const,
        properties: {
          required_param: { type: 'string' },
          optional_param: { type: 'string' },
        },
        required: ['required_param'],
      },
    };

    const overriddenTool: Tool = {
      name: 'test_tool',
      inputSchema: {
        type: 'object' as const,
        properties: {
          optional_param: { type: 'string' },
        },
        required: [],
      },
    };

    const result = validator.validateOverride(originalTool, overriddenTool);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toContain(
      "Required parameter 'required_param' removed in override for test_tool",
    );
  });

  it('should error on type mismatches', () => {
    const validator = new OverrideValidator();

    const originalTool: Tool = {
      name: 'test_tool',
      inputSchema: {
        type: 'object' as const,
        properties: {
          param1: { type: 'string' },
        },
      },
    };

    const overriddenTool: Tool = {
      name: 'test_tool',
      inputSchema: {
        type: 'object' as const,
        properties: {
          param1: { type: 'number' },
        },
      },
    };

    const result = validator.validateOverride(originalTool, overriddenTool);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Type mismatch for property 'param1': changed from string to number",
    );
  });

  it('should validate successfully when no issues', () => {
    const validator = new OverrideValidator();

    const originalTool: Tool = {
      name: 'test_tool',
      inputSchema: {
        type: 'object' as const,
        properties: {
          param1: { type: 'string' },
        },
        required: ['param1'],
      },
    };

    const overriddenTool: Tool = {
      name: 'test_tool',
      description: 'Updated description',
      inputSchema: {
        type: 'object' as const,
        properties: {
          param1: { type: 'string', description: 'Updated param description' },
          param2: { type: 'number' },
        },
        required: ['param1'],
      },
    };

    const result = validator.validateOverride(originalTool, overriddenTool);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
