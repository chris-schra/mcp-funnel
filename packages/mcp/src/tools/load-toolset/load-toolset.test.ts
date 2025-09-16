import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoadToolset } from './index.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { ProxyConfig } from '../../config.js';

describe('LoadToolset', () => {
  let loadToolset: LoadToolset;
  let mockContext: CoreToolContext;
  let enabledTools: string[];

  beforeEach(() => {
    loadToolset = new LoadToolset();
    enabledTools = [];

    mockContext = {
      toolDescriptionCache: new Map([
        [
          'github__create_issue',
          { serverName: 'github', description: 'Create an issue' },
        ],
        [
          'github__update_issue',
          { serverName: 'github', description: 'Update an issue' },
        ],
        [
          'github__list_pull_requests',
          { serverName: 'github', description: 'List PRs' },
        ],
        [
          'github__create_pull_request',
          { serverName: 'github', description: 'Create a PR' },
        ],
        [
          'github__update_pull_request',
          { serverName: 'github', description: 'Update a PR' },
        ],
        [
          'github__merge_pull_request',
          { serverName: 'github', description: 'Merge a PR' },
        ],
        ['memory__store', { serverName: 'memory', description: 'Store data' }],
        [
          'memory__retrieve',
          { serverName: 'memory', description: 'Retrieve data' },
        ],
      ]),
      dynamicallyEnabledTools: new Set<string>(),
      config: {
        servers: [],
        toolsets: {
          reviewer: ['github__*_pull_request*', 'github__update_issue'],
          coder: ['github__create_pull_request'],
          memory: ['memory__*'],
        },
      },
      enableTools: vi.fn((tools: string[]) => {
        enabledTools.push(...tools);
      }),
    };
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(loadToolset.name).toBe('load_toolset');
    });

    it('should have correct input schema with mutual exclusivity', () => {
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

  describe('isEnabled', () => {
    it('should be enabled when exposeCoreTools is not specified', () => {
      const config: ProxyConfig = {
        servers: [],
      };
      expect(loadToolset.isEnabled(config)).toBe(true);
    });

    it('should be disabled when exposeCoreTools is empty array', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: [],
      };
      expect(loadToolset.isEnabled(config)).toBe(false);
    });

    it('should be enabled when exposeCoreTools includes tool name', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['load_toolset'],
      };
      expect(loadToolset.isEnabled(config)).toBe(true);
    });

    it('should be enabled when exposeCoreTools has matching pattern', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['load_*'],
      };
      expect(loadToolset.isEnabled(config)).toBe(true);
    });

    it('should be enabled when exposeCoreTools is ["*"]', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['*'],
      };
      expect(loadToolset.isEnabled(config)).toBe(true);
    });

    it('should be disabled when exposeCoreTools excludes the tool', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['other_tool'],
      };
      expect(loadToolset.isEnabled(config)).toBe(false);
    });
  });

  describe('handle - loading by name', () => {
    it('should load tools from a named toolset', async () => {
      const result = await loadToolset.handle(
        { name: 'reviewer' },
        mockContext,
      );

      expect(enabledTools).toHaveLength(5);
      expect(enabledTools).toContain('github__list_pull_requests');
      expect(enabledTools).toContain('github__create_pull_request');
      expect(enabledTools).toContain('github__update_pull_request');
      expect(enabledTools).toContain('github__merge_pull_request');
      expect(enabledTools).toContain('github__update_issue');

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Loaded 5 tools from "reviewer" toolset',
      });
      expect(result.isError).toBeUndefined();
    });

    it('should load tools from coder toolset', async () => {
      const result = await loadToolset.handle({ name: 'coder' }, mockContext);

      expect(enabledTools).toEqual(['github__create_pull_request']);

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Loaded 1 tools from "coder" toolset',
      });
    });

    it('should handle wildcard patterns correctly', async () => {
      const result = await loadToolset.handle({ name: 'memory' }, mockContext);

      expect(enabledTools).toEqual(['memory__store', 'memory__retrieve']);

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Loaded 2 tools from "memory" toolset',
      });
    });

    it('should return error for non-existent toolset', async () => {
      const result = await loadToolset.handle(
        { name: 'nonexistent' },
        mockContext,
      );

      expect(enabledTools).toEqual([]);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Toolset "nonexistent" not found. Available toolsets: reviewer, coder, memory',
      });
      expect(result.isError).toBe(true);
    });

    it('should handle missing toolsets config', async () => {
      mockContext.config.toolsets = undefined;

      const result = await loadToolset.handle(
        { name: 'reviewer' },
        mockContext,
      );

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'No toolsets configured. Add a "toolsets" object to your configuration.',
      });
      expect(result.isError).toBe(true);
    });

    it('should handle empty toolsets config', async () => {
      mockContext.config.toolsets = {};

      const result = await loadToolset.handle(
        { name: 'reviewer' },
        mockContext,
      );

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Toolset "reviewer" not found. Available toolsets: none',
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('handle - loading by patterns', () => {
    it('should load tools matching explicit patterns', async () => {
      const result = await loadToolset.handle(
        { tools: ['github__create_*', 'memory__store'] },
        mockContext,
      );

      expect(enabledTools).toEqual([
        'github__create_issue',
        'github__create_pull_request',
        'memory__store',
      ]);

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Loaded 3 tools matching specified patterns',
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle patterns with no matches', async () => {
      const result = await loadToolset.handle(
        { tools: ['nonexistent__*'] },
        mockContext,
      );

      expect(enabledTools).toEqual([]);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'No tools found matching patterns: nonexistent__*',
      });
      expect(result.isError).toBeUndefined();
    });

    it('should validate tools parameter is an array', async () => {
      const result = await loadToolset.handle(
        { tools: 'not-an-array' },
        mockContext,
      );

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Invalid tools parameter: must be an array of tool patterns',
      });
      expect(result.isError).toBe(true);
    });

    it('should handle empty tools array', async () => {
      const result = await loadToolset.handle({ tools: [] }, mockContext);

      expect(enabledTools).toEqual([]);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'No tools found matching patterns: ',
      });
    });
  });

  describe('pattern matching', () => {
    it('should match exact tool names', async () => {
      await loadToolset.handle(
        { tools: ['github__create_issue'] },
        mockContext,
      );

      expect(enabledTools).toEqual(['github__create_issue']);
    });

    it('should match with wildcard at end', async () => {
      await loadToolset.handle({ tools: ['github__create_*'] }, mockContext);

      expect(enabledTools).toContain('github__create_issue');
      expect(enabledTools).toContain('github__create_pull_request');
    });

    it('should match with wildcard at beginning', async () => {
      await loadToolset.handle({ tools: ['*__store'] }, mockContext);

      expect(enabledTools).toEqual(['memory__store']);
    });

    it('should match with wildcard in middle', async () => {
      await loadToolset.handle({ tools: ['github__*_issue'] }, mockContext);

      expect(enabledTools).toContain('github__create_issue');
      expect(enabledTools).toContain('github__update_issue');
    });

    it('should match with multiple wildcards', async () => {
      await loadToolset.handle({ tools: ['*__*_pull_request*'] }, mockContext);

      expect(enabledTools).toContain('github__list_pull_requests');
      expect(enabledTools).toContain('github__create_pull_request');
      expect(enabledTools).toContain('github__update_pull_request');
      expect(enabledTools).toContain('github__merge_pull_request');
    });

    it('should not match partial strings without wildcards', async () => {
      await loadToolset.handle(
        { tools: ['github__create'] }, // No wildcard, should not match
        mockContext,
      );

      expect(enabledTools).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should require either name or tools parameter', async () => {
      // Test with neither name nor tools
      const result = await loadToolset.handle({}, mockContext);

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Either "name" or "tools" parameter is required',
      });
      expect(result.isError).toBe(true);
    });

    it('should reject both name and tools parameters together', async () => {
      // Test with both name and tools
      const result = await loadToolset.handle(
        { name: 'reviewer', tools: ['github__*'] },
        mockContext,
      );

      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Provide either "name" or "tools", not both',
      });
      expect(result.isError).toBe(true);
    });

    it('should deduplicate tools when patterns overlap', async () => {
      await loadToolset.handle(
        { tools: ['github__create_pull_request', 'github__*_pull_request'] },
        mockContext,
      );

      // Should not have duplicates
      const uniqueTools = [...new Set(enabledTools)];
      expect(enabledTools).toEqual(uniqueTools);
      expect(
        enabledTools.filter((t) => t === 'github__create_pull_request'),
      ).toHaveLength(1);
    });
  });
});
