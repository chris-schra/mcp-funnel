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
