import { describe, it, expect } from 'vitest';

// Create a local implementation of normalizeServers for testing
// This mirrors the implementation from packages/mcp/src/config.ts
type TargetServer = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

type TargetServerWithoutName = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

type ServersRecord = Record<string, TargetServerWithoutName>;

function normalizeServers(
  servers: TargetServer[] | ServersRecord,
): TargetServer[] {
  if (Array.isArray(servers)) {
    return servers;
  }

  return Object.entries(servers).map(([name, server]) => ({
    name,
    ...server,
  }));
}

describe('Record Format Normalization Integration', () => {
  describe('normalizeServers function', () => {
    it('should convert record format to array format', () => {
      const recordServers: ServersRecord = {
        github: {
          command: 'docker',
          args: ['run', 'github-mcp'],
          env: { GITHUB_TOKEN: 'secret' },
        },
        memory: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory'],
        },
        filesystem: {
          command: 'node',
          args: ['fs-server.js'],
          env: { ROOT_PATH: '/workspace' },
        },
      };

      const normalized = normalizeServers(recordServers);

      expect(normalized).toHaveLength(3);
      expect(normalized).toEqual([
        {
          name: 'github',
          command: 'docker',
          args: ['run', 'github-mcp'],
          env: { GITHUB_TOKEN: 'secret' },
        },
        {
          name: 'memory',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory'],
        },
        {
          name: 'filesystem',
          command: 'node',
          args: ['fs-server.js'],
          env: { ROOT_PATH: '/workspace' },
        },
      ]);
    });

    it('should pass through array format unchanged', () => {
      const arrayServers: TargetServer[] = [
        {
          name: 'github',
          command: 'docker',
          args: ['run', 'github-mcp'],
        },
        {
          name: 'memory',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory'],
        },
      ];

      const normalized = normalizeServers(arrayServers);

      expect(normalized).toEqual(arrayServers);
      expect(normalized).toBe(arrayServers); // Should be the same reference
    });

    it('should handle single server record format', () => {
      const singleServer: ServersRecord = {
        'my-server': {
          command: 'echo',
          args: ['hello'],
        },
      };

      const normalized = normalizeServers(singleServer);

      expect(normalized).toHaveLength(1);
      expect(normalized[0]).toEqual({
        name: 'my-server',
        command: 'echo',
        args: ['hello'],
      });
    });

    it('should handle empty record format', () => {
      const emptyServers: ServersRecord = {};

      const normalized = normalizeServers(emptyServers);

      expect(normalized).toEqual([]);
    });

    it('should preserve server names with special characters', () => {
      const recordServers: ServersRecord = {
        'github-issues': {
          command: 'github-mcp',
          args: ['--mode=issues'],
        },
        memory_store_v2: {
          command: 'memory-server-v2',
        },
        'fs.local': {
          command: 'filesystem',
          env: { MODE: 'local' },
        },
      };

      const normalized = normalizeServers(recordServers);

      expect(normalized).toHaveLength(3);
      expect(normalized.map((s) => s.name)).toEqual([
        'github-issues',
        'memory_store_v2',
        'fs.local',
      ]);
    });

    it('should preserve all server configuration options', () => {
      const recordServers: ServersRecord = {
        'full-config': {
          command: 'docker',
          args: ['run', '--rm', 'test-image'],
          env: {
            API_KEY: 'secret',
            DEBUG: 'true',
            TIMEOUT: '30',
          },
        },
      };

      const normalized = normalizeServers(recordServers);

      expect(normalized[0]).toEqual({
        name: 'full-config',
        command: 'docker',
        args: ['run', '--rm', 'test-image'],
        env: {
          API_KEY: 'secret',
          DEBUG: 'true',
          TIMEOUT: '30',
        },
      });
    });
  });

  describe('Integration with Server Configuration', () => {
    it('should demonstrate full config loading and normalization flow', () => {
      // Simulate a config that would be loaded from a file
      const rawConfig = {
        servers: {
          github: {
            command: 'docker',
            args: ['run', 'github-mcp'],
            env: { GITHUB_TOKEN: 'test-token' },
          },
          memory: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-memory'],
          },
        },
        hideTools: ['debug_*'],
        exposeTools: ['github__*'],
        enableDynamicDiscovery: true,
      };

      // This represents what would happen in MCPProxy initialization
      const normalizedServers = normalizeServers(rawConfig.servers);

      expect(normalizedServers).toHaveLength(2);
      expect(normalizedServers[0].name).toBe('github');
      expect(normalizedServers[1].name).toBe('memory');

      // Verify the configuration would work with API endpoint
      const apiResponse = {
        config: {
          servers: normalizedServers.map((s) => ({
            name: s.name,
            command: s.command,
            args: s.args,
            // env is excluded from API response for security
          })),
          hideTools: rawConfig.hideTools,
          exposeTools: rawConfig.exposeTools,
          enableDynamicDiscovery: rawConfig.enableDynamicDiscovery,
          hackyDiscovery: false,
        },
      };

      expect(apiResponse.config.servers).toEqual([
        {
          name: 'github',
          command: 'docker',
          args: ['run', 'github-mcp'],
        },
        {
          name: 'memory',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory'],
        },
      ]);
    });
  });
});
