import { describe, test, expect, beforeEach } from 'vitest';
import { ToolVisibilityManager } from '../../src/tool-visibility-manager.js';
import { ProxyConfig } from '../../src/config.js';

describe('Tool Visibility Integration', () => {
  let visibilityManager: ToolVisibilityManager;
  let dynamicallyEnabledTools: Set<string>;

  beforeEach(() => {
    visibilityManager = new ToolVisibilityManager();
    dynamicallyEnabledTools = new Set<string>();
  });

  describe('hideTools configuration', () => {
    test('should hide tools matching exact patterns', () => {
      const config: ProxyConfig = {
        servers: [],
        hideTools: ['mockserver__hidden_tool', 'mockserver__secret_tool'],
      };

      expect(
        visibilityManager.isToolVisible(
          'mockserver__hidden_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);

      expect(
        visibilityManager.isToolVisible(
          'mockserver__secret_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);

      expect(
        visibilityManager.isToolVisible(
          'mockserver__visible_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);
    });

    test('should hide tools matching wildcard patterns', () => {
      const config: ProxyConfig = {
        servers: [],
        hideTools: ['mockserver__*_issue', 'github__debug_*'],
      };

      expect(
        visibilityManager.isToolVisible(
          'mockserver__create_issue',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);

      expect(
        visibilityManager.isToolVisible(
          'mockserver__list_issue',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);

      expect(
        visibilityManager.isToolVisible(
          'github__debug_logs',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);

      expect(
        visibilityManager.isToolVisible(
          'mockserver__echo',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);
    });

    test('should respect the exact e2e test configuration', () => {
      // This matches config.with-hidden-tools.json
      const config: ProxyConfig = {
        servers: [],
        hideTools: ['mockserver__hidden_tool', 'mockserver__*_issue'],
      };

      // These should be hidden
      expect(
        visibilityManager.isToolVisible(
          'mockserver__hidden_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);

      expect(
        visibilityManager.isToolVisible(
          'mockserver__create_issue',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);

      // These should be visible
      expect(
        visibilityManager.isToolVisible(
          'mockserver__echo',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);

      expect(
        visibilityManager.isToolVisible(
          'mockserver__exposed_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);

      expect(
        visibilityManager.isToolVisible(
          'mockserver__other_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);
    });
  });

  describe('exposeTools configuration', () => {
    test('should only expose tools matching patterns when defined', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeTools: ['mockserver__exposed_tool', 'github__*'],
      };

      expect(
        visibilityManager.isToolVisible(
          'mockserver__exposed_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);

      expect(
        visibilityManager.isToolVisible(
          'github__create_issue',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);

      expect(
        visibilityManager.isToolVisible(
          'mockserver__other_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);
    });

    test('should hide all tools when exposeTools is empty array', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeTools: [],
      };

      expect(
        visibilityManager.isToolVisible(
          'mockserver__any_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);

      expect(
        visibilityManager.isToolVisible(
          'github__any_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);
    });

    test('should expose all tools except hidden when exposeTools is undefined', () => {
      const config: ProxyConfig = {
        servers: [],
        hideTools: ['mockserver__hidden_tool'],
      };

      expect(
        visibilityManager.isToolVisible(
          'mockserver__hidden_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);

      expect(
        visibilityManager.isToolVisible(
          'mockserver__visible_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);
    });
  });

  describe('alwaysVisibleTools configuration', () => {
    test('should override hideTools', () => {
      const config: ProxyConfig = {
        servers: [],
        hideTools: ['mockserver__*'],
        alwaysVisibleTools: ['mockserver__important_tool'],
      };

      // Despite being hidden by pattern, this tool is always visible
      expect(
        visibilityManager.isToolVisible(
          'mockserver__important_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);

      // Other tools are hidden
      expect(
        visibilityManager.isToolVisible(
          'mockserver__other_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);
    });

    test('should override empty exposeTools', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeTools: [],
        alwaysVisibleTools: ['critical__*'],
      };

      // Despite empty exposeTools, critical tools are visible
      expect(
        visibilityManager.isToolVisible(
          'critical__system_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);

      // Non-critical tools are hidden
      expect(
        visibilityManager.isToolVisible(
          'normal__tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false);
    });
  });

  describe('dynamically enabled tools', () => {
    test('should be visible regardless of configuration', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeTools: [],
        hideTools: ['*'],
      };

      dynamicallyEnabledTools.add('special__tool');

      // Despite being hidden by both exposeTools and hideTools
      expect(
        visibilityManager.isToolVisible(
          'special__tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);
    });
  });

  describe('core tools', () => {
    test('should be enabled by default when exposeCoreTools is undefined', () => {
      const config: ProxyConfig = {
        servers: [],
      };

      expect(
        visibilityManager.isCoreToolEnabled('discover_tools_by_words', config),
      ).toBe(true);
    });

    test('should be disabled when exposeCoreTools is empty', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: [],
      };

      expect(
        visibilityManager.isCoreToolEnabled('discover_tools_by_words', config),
      ).toBe(false);
    });

    test('should respect exposeCoreTools patterns', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['discover_*', 'bridge_tool_request'],
      };

      expect(
        visibilityManager.isCoreToolEnabled('discover_tools_by_words', config),
      ).toBe(true);

      expect(
        visibilityManager.isCoreToolEnabled('bridge_tool_request', config),
      ).toBe(true);

      expect(
        visibilityManager.isCoreToolEnabled('get_tool_schema', config),
      ).toBe(false);

      expect(visibilityManager.isCoreToolEnabled('load_toolset', config)).toBe(
        false,
      );
    });

    test('core tools should NOT be affected by hideTools or exposeTools', () => {
      const config: ProxyConfig = {
        servers: [],
        hideTools: ['*'], // Hide everything
        exposeTools: [], // Or expose nothing
      };

      // Core tools should still be enabled if exposeCoreTools allows them
      // (defaults to true when undefined)
      expect(
        visibilityManager.isCoreToolEnabled('discover_tools_by_words', config),
      ).toBe(true);

      // But if exposeCoreTools is empty, they're disabled
      const configNoCoreTools: ProxyConfig = {
        servers: [],
        hideTools: ['*'],
        exposeCoreTools: [],
      };

      expect(
        visibilityManager.isCoreToolEnabled(
          'discover_tools_by_words',
          configNoCoreTools,
        ),
      ).toBe(false);
    });
  });

  describe('priority order', () => {
    test('should follow correct priority: always > dynamic > expose/hide', () => {
      const config: ProxyConfig = {
        servers: [],
        exposeTools: ['allowed__*'],
        hideTools: ['*__secret_*'],
        alwaysVisibleTools: ['special__secret_tool'],
      };

      // alwaysVisibleTools wins over hideTools
      expect(
        visibilityManager.isToolVisible(
          'special__secret_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);

      // Dynamic wins over configuration
      dynamicallyEnabledTools.add('forbidden__secret_tool');
      expect(
        visibilityManager.isToolVisible(
          'forbidden__secret_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);

      // exposeTools and hideTools work together
      expect(
        visibilityManager.isToolVisible(
          'allowed__normal_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true);

      expect(
        visibilityManager.isToolVisible(
          'allowed__secret_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(true); // exposeTools is checked first

      expect(
        visibilityManager.isToolVisible(
          'other__secret_tool',
          config,
          dynamicallyEnabledTools,
        ),
      ).toBe(false); // Not in exposeTools
    });
  });

  describe('explicit hiding (no caching)', () => {
    test('should identify explicitly hidden tools', () => {
      const config: ProxyConfig = {
        servers: [],
        hideTools: ['secret__*', 'private__tool'],
      };

      expect(
        visibilityManager.isExplicitlyHidden('secret__password', config),
      ).toBe(true);

      expect(
        visibilityManager.isExplicitlyHidden('private__tool', config),
      ).toBe(true);

      expect(visibilityManager.isExplicitlyHidden('public__tool', config)).toBe(
        false,
      );
    });

    test('should not hide tools in alwaysVisibleTools even if in hideTools', () => {
      const config: ProxyConfig = {
        servers: [],
        hideTools: ['secret__*'],
        alwaysVisibleTools: ['secret__important'],
      };

      // This tool matches hideTools pattern but is in alwaysVisibleTools
      expect(
        visibilityManager.isExplicitlyHidden('secret__important', config),
      ).toBe(false);

      // This tool only matches hideTools
      expect(
        visibilityManager.isExplicitlyHidden('secret__other', config),
      ).toBe(true);
    });
  });
});
