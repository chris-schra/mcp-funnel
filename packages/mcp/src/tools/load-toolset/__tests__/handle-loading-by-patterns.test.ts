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
      const result = await loadToolset.handle({ tools: ['nonexistent__*'] }, mockContext);

      expect(enabledTools).toEqual([]);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'No tools found matching patterns: nonexistent__*',
      });
      expect(result.isError).toBeUndefined();
    });

    it('should validate tools parameter is an array', async () => {
      const result = await loadToolset.handle({ tools: 'not-an-array' }, mockContext);

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
});
