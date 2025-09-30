import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from './index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let config: ProxyConfig;

  beforeEach(() => {
    config = {
      servers: [],
      hideTools: ['github__get_teams', 'github__get_team_*', 'memory__debug_*'],
    };
    registry = new ToolRegistry(config);
  });

  describe('hideTools as firewall', () => {
    beforeEach(() => {
      // Register some tools
      const tools = [
        {
          fullName: 'github__get_teams',
          originalName: 'get_teams',
          serverName: 'github',
        },
        {
          fullName: 'github__get_team_members',
          originalName: 'get_team_members',
          serverName: 'github',
        },
        {
          fullName: 'github__create_issue',
          originalName: 'create_issue',
          serverName: 'github',
        },
        {
          fullName: 'memory__debug_stats',
          originalName: 'debug_stats',
          serverName: 'memory',
        },
        {
          fullName: 'memory__store',
          originalName: 'store',
          serverName: 'memory',
        },
      ];

      for (const tool of tools) {
        const definition: Tool = {
          name: tool.originalName,
          description: `Description for ${tool.originalName}`,
          inputSchema: { type: 'object' },
        };
        registry.registerDiscoveredTool({
          ...tool,
          definition,
        });
      }
    });

    it('should NOT discover hidden tools via searchTools', () => {
      // Search for team tools
      const teamTools = registry.searchTools(['team']);

      // Should not find github__get_teams or github__get_team_members
      expect(teamTools.map((t) => t.fullName)).not.toContain(
        'github__get_teams',
      );
      expect(teamTools.map((t) => t.fullName)).not.toContain(
        'github__get_team_members',
      );
    });

    it('should NOT expose hidden tools in getExposedTools', () => {
      const exposed = registry.getExposedTools();
      const exposedNames = exposed.map((t) => t.name);

      expect(exposedNames).not.toContain('github__get_teams');
      expect(exposedNames).not.toContain('github__get_team_members');
      expect(exposedNames).not.toContain('memory__debug_stats');

      // Non-hidden tools should be exposed
      expect(exposedNames).toContain('github__create_issue');
      expect(exposedNames).toContain('memory__store');
    });

    it('should NOT allow execution of hidden tools', () => {
      const tool = registry.getToolForExecution('github__get_teams');
      expect(tool).toBeUndefined();

      const debugTool = registry.getToolForExecution('memory__debug_stats');
      expect(debugTool).toBeUndefined();
    });

    it('should NOT include hidden tools in tool descriptions', () => {
      const descriptions = registry.getToolDescriptions();

      // Hidden tools should not be in descriptions
      expect(descriptions.has('github__get_teams')).toBe(false);
      expect(descriptions.has('github__get_team_members')).toBe(false);
      expect(descriptions.has('memory__debug_stats')).toBe(false);

      // Non-hidden tools should be present
      expect(descriptions.has('github__create_issue')).toBe(true);
      expect(descriptions.has('memory__store')).toBe(true);
    });

    it('should respect wildcard patterns in hideTools', () => {
      const teamMembers = registry.searchTools(['members']);
      expect(teamMembers.map((t) => t.fullName)).not.toContain(
        'github__get_team_members',
      );

      const debugTools = registry.searchTools(['debug']);
      expect(debugTools.map((t) => t.fullName)).not.toContain(
        'memory__debug_stats',
      );
    });

    it('should still allow non-hidden tools to be discovered', () => {
      const issueTools = registry.searchTools(['issue']);
      expect(issueTools.map((t) => t.fullName)).toContain(
        'github__create_issue',
      );

      const memoryTools = registry.searchTools(['store']);
      expect(memoryTools.map((t) => t.fullName)).toContain('memory__store');
    });

    it('should completely block hidden tools even if explicitly enabled', () => {
      // Try to enable a hidden tool
      registry.enableTools(['github__get_teams'], 'discovery');

      // Should still not be discoverable or executable
      const teamTools = registry.searchTools(['teams']);
      expect(teamTools.map((t) => t.fullName)).not.toContain(
        'github__get_teams',
      );

      const executable = registry.getToolForExecution('github__get_teams');
      expect(executable).toBeUndefined();
    });

    it('should allow alwaysVisibleTools to override hideTools', () => {
      // Create a new registry with alwaysVisibleTools
      const configWithAlways: ProxyConfig = {
        servers: [],
        hideTools: ['github__*'],
        alwaysVisibleTools: ['github__create_issue'],
      };
      const registryWithAlways = new ToolRegistry(configWithAlways);

      // Register tools
      registryWithAlways.registerDiscoveredTool({
        fullName: 'github__create_issue',
        originalName: 'create_issue',
        serverName: 'github',
        definition: {
          name: 'create_issue',
          description: 'Create an issue',
          inputSchema: { type: 'object' },
        },
      });

      registryWithAlways.registerDiscoveredTool({
        fullName: 'github__get_teams',
        originalName: 'get_teams',
        serverName: 'github',
        definition: {
          name: 'get_teams',
          description: 'Get teams',
          inputSchema: { type: 'object' },
        },
      });

      // create_issue should be visible (alwaysVisible overrides hide)
      const exposed = registryWithAlways.getExposedTools();
      expect(exposed.map((t) => t.name)).toContain('github__create_issue');

      // get_teams should still be hidden
      expect(exposed.map((t) => t.name)).not.toContain('github__get_teams');
    });
  });
});
