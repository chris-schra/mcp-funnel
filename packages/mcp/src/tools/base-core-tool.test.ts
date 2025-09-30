import { describe, it, expect } from 'vitest';
import { BaseCoreTool } from './base-core-tool.js';
import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from './core-tool.interface.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

// Create a concrete implementation for testing
class TestTool extends BaseCoreTool {
  readonly name = 'test_tool';

  get tool(): Tool {
    return {
      name: this.name,
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    };
  }

  async handle(
    _args: Record<string, unknown>,
    _context: CoreToolContext,
  ): Promise<CallToolResult> {
    return {
      content: [{ type: 'text', text: 'test result' }],
    };
  }
}

describe('BaseCoreTool', () => {
  const tool = new TestTool();

  describe('isEnabled with exposeCoreTools', () => {
    it('should be enabled when exposeCoreTools is not specified', () => {
      const config: ProxyConfig = { servers: [] };
      expect(tool.isEnabled(config)).toBe(true);
    });

    it('should be disabled when exposeCoreTools is empty array', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: [],
      };
      expect(tool.isEnabled(config)).toBe(false);
    });

    it('should be enabled when tool name matches exact pattern', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['test_tool'],
      };
      expect(tool.isEnabled(config)).toBe(true);
    });

    it('should be enabled when tool name matches wildcard pattern', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['test_*'],
      };
      expect(tool.isEnabled(config)).toBe(true);
    });

    it('should be enabled when tool name matches any of multiple patterns', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['other_*', 'test_*'],
      };
      expect(tool.isEnabled(config)).toBe(true);
    });

    it('should be disabled when tool name does not match any pattern', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['other_tool', 'different_*'],
      };
      expect(tool.isEnabled(config)).toBe(false);
    });

    it('should handle complex wildcard patterns', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['*_tool'],
      };
      expect(tool.isEnabled(config)).toBe(true);
    });

    it('should handle patterns with multiple wildcards', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['*st_to*'],
      };
      expect(tool.isEnabled(config)).toBe(true);
    });
  });
});
