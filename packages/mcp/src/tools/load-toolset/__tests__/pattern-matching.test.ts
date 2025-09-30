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
});
