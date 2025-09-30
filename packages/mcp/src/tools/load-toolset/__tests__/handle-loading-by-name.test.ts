import { describe, it, expect, beforeEach } from 'vitest';
import { LoadToolset } from '../index.js';
import { CoreToolContext } from '../../core-tool.interface.js';
import { createMockContext } from './test-utils.js';

describe('LoadToolset', () => {
  let loadToolset: LoadToolset;
  let mockContext: CoreToolContext;
  let enabledTools: string[];

  beforeEach(() => {
    loadToolset = new LoadToolset();
    enabledTools = [];
    mockContext = createMockContext(enabledTools);
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
});
