import { describe, it, expect } from 'vitest';

// We'll need to extract the filtering logic into a testable module
// For now, let's test the pattern matching logic

describe('Tool Filtering', () => {
  describe('Pattern Matching', () => {
    const matchesPattern = (toolName: string, pattern: string): boolean => {
      // Convert wildcard pattern to regex
      const regexPattern = pattern
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(toolName);
    };

    it('should match exact tool names', () => {
      expect(matchesPattern('get_issue', 'get_issue')).toBe(true);
      expect(matchesPattern('get_issue', 'create_issue')).toBe(false);
    });

    it('should match with wildcard at end', () => {
      expect(matchesPattern('dashboard_get_stats', 'dashboard_*')).toBe(true);
      expect(matchesPattern('dashboard_optimize', 'dashboard_*')).toBe(true);
      expect(matchesPattern('get_dashboard', 'dashboard_*')).toBe(false);
    });

    it('should match with wildcard at start', () => {
      expect(matchesPattern('get_workflow_runs', '*_workflow_runs')).toBe(true);
      expect(matchesPattern('list_workflow_runs', '*_workflow_runs')).toBe(
        true,
      );
      expect(matchesPattern('workflow_runs_get', '*_workflow_runs')).toBe(
        false,
      );
    });

    it('should match with wildcard in middle', () => {
      expect(matchesPattern('get_workflow_runs', 'get_*_runs')).toBe(true);
      expect(matchesPattern('get_test_runs', 'get_*_runs')).toBe(true);
      expect(matchesPattern('list_workflow_runs', 'get_*_runs')).toBe(false);
    });

    it('should match with multiple wildcards', () => {
      expect(matchesPattern('dashboard_get_stats', '*_get_*')).toBe(true);
      expect(matchesPattern('memory_get_embedding', '*_get_*')).toBe(true);
      expect(matchesPattern('get_stats_dashboard', '*_get_*')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(matchesPattern('', '')).toBe(true);
      expect(matchesPattern('test', '*')).toBe(true);
      expect(matchesPattern('', '*')).toBe(true);
      expect(matchesPattern('test', '')).toBe(false);
    });
  });

  describe('shouldExposeTool', () => {
    const shouldExposeTool = (
      toolName: string,
      config: { exposeTools?: string[]; hideTools?: string[] },
    ): boolean => {
      const matchesPattern = (name: string, pattern: string): boolean => {
        const regexPattern = pattern
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(name);
      };

      if (config.exposeTools) {
        return config.exposeTools.some((pattern) =>
          matchesPattern(toolName, pattern),
        );
      }
      if (config.hideTools) {
        return !config.hideTools.some((pattern) =>
          matchesPattern(toolName, pattern),
        );
      }
      return true;
    };

    it('should expose all tools when no filters configured', () => {
      expect(shouldExposeTool('any_tool', {})).toBe(true);
    });

    it('should hide tools matching hideTools patterns', () => {
      const config = { hideTools: ['dashboard_*', 'debug_*'] };

      expect(shouldExposeTool('dashboard_stats', config)).toBe(false);
      expect(shouldExposeTool('debug_retrieve', config)).toBe(false);
      expect(shouldExposeTool('get_issue', config)).toBe(true);
    });

    it('should only expose tools matching exposeTools patterns', () => {
      const config = { exposeTools: ['*_issue', '*_pull_request'] };

      expect(shouldExposeTool('get_issue', config)).toBe(true);
      expect(shouldExposeTool('create_issue', config)).toBe(true);
      expect(shouldExposeTool('get_pull_request', config)).toBe(true);
      expect(shouldExposeTool('get_workflow', config)).toBe(false);
    });

    it('should prioritize exposeTools over hideTools', () => {
      const config = {
        exposeTools: ['get_*'],
        hideTools: ['*_issue'],
      };

      // exposeTools takes precedence
      expect(shouldExposeTool('get_issue', config)).toBe(true);
      expect(shouldExposeTool('create_issue', config)).toBe(false);
    });

    it('should handle complex patterns', () => {
      const config = {
        hideTools: [
          'ingest_*',
          'dashboard_*',
          'delete_by_*',
          'debug_*',
          'exact_match_*',
          'get_embedding',
          'check_embedding_model',
          'check_database_health',
        ],
      };

      expect(shouldExposeTool('ingest_document', config)).toBe(false);
      expect(shouldExposeTool('dashboard_get_stats', config)).toBe(false);
      expect(shouldExposeTool('delete_by_tag', config)).toBe(false);
      expect(shouldExposeTool('get_embedding', config)).toBe(false);
      expect(shouldExposeTool('store_memory', config)).toBe(true);
      expect(shouldExposeTool('retrieve_memory', config)).toBe(true);
    });

    it('should reproduce the e2e test scenario - hideTools with prefixed names', () => {
      // This matches config.with-hidden-tools.json
      const config = {
        hideTools: ['mockserver__hidden_tool', 'mockserver__*_issue'],
      };

      // The mockserver__hidden_tool should be hidden
      expect(shouldExposeTool('mockserver__hidden_tool', config)).toBe(false);
      expect(shouldExposeTool('mockserver__create_issue', config)).toBe(false);
      expect(shouldExposeTool('mockserver__list_issue', config)).toBe(false);

      // Other mockserver tools should be visible
      expect(shouldExposeTool('mockserver__echo', config)).toBe(true);
      expect(shouldExposeTool('mockserver__exposed_tool', config)).toBe(true);
      expect(shouldExposeTool('mockserver__other_tool', config)).toBe(true);
    });

    it('should handle empty exposeTools array (dynamic discovery mode)', () => {
      // When exposeTools is an empty array, no tools should be exposed
      const config = { exposeTools: [] };

      expect(shouldExposeTool('any_tool', config)).toBe(false);
      expect(shouldExposeTool('mockserver__hidden_tool', config)).toBe(false);
      expect(shouldExposeTool('mockserver__echo', config)).toBe(false);
    });

    it('should handle exposeTools empty array with hideTools', () => {
      // This matches the updated config.with-hidden-tools.json
      const config = {
        exposeTools: [],
        hideTools: ['mockserver__hidden_tool', 'mockserver__*_issue'],
      };

      // With empty exposeTools, ALL tools should be hidden (dynamic discovery mode)
      expect(shouldExposeTool('mockserver__hidden_tool', config)).toBe(false);
      expect(shouldExposeTool('mockserver__echo', config)).toBe(false);
      expect(shouldExposeTool('mockserver__exposed_tool', config)).toBe(false);
    });
  });
});
