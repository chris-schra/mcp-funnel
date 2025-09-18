import { describe, test, expect, vi, beforeEach } from 'vitest';
import type {
  ServerDependency,
  ServerRequirementResult,
} from '../interfaces.js';
import { BaseCommand } from '../base-command.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

// Mock MCPProxy interface for testing
interface MockMCPProxy {
  getTargetServers(): {
    connected: Array<[string, unknown]>;
    disconnected: Array<[string, unknown]>;
  };
  registry: {
    enableTools: (toolNames: string[], enabledBy: string) => void;
  };
}

// Mock command class for testing
class TestCommand extends BaseCommand {
  readonly name = 'test-command';
  readonly description = 'Test command for server dependency testing';

  private mockProxy?: MockMCPProxy;

  async executeToolViaMCP(
    toolName: string,
    _args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    return {
      content: [{ type: 'text', text: `Executed ${toolName}` }],
    };
  }

  async executeViaCLI(_args: string[]): Promise<void> {
    // TODO: CLI execution logic will be implemented in Phase 3
    console.log('CLI executed');
  }

  getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  getServerDependencies(): ServerDependency[] {
    return [
      {
        aliases: ['github', 'github-mcp'],
        ensureToolsExposed: true,
      },
      {
        aliases: ['filesystem', 'fs-mcp'],
        ensureToolsExposed: false,
      },
    ];
  }

  // Test helper to set mock proxy
  setMockProxy(proxy: MockMCPProxy): void {
    this.mockProxy = proxy;
  }

  // Test helper to simulate proxy access
  protected getProxy(): MockMCPProxy | undefined {
    return this.mockProxy;
  }

  // Method to be implemented in Phase 3 - currently just a stub for testing
  // Made public for testing purposes
  async requireServer(
    dependency: ServerDependency,
  ): Promise<ServerRequirementResult> {
    const proxy = this.getProxy();
    if (!proxy) {
      return undefined;
    }

    const { connected } = proxy.getTargetServers();
    const serverNames = connected.map(([name]) => name);

    // Check if any alias matches connected servers
    const isConfigured = dependency.aliases.some((alias) =>
      serverNames.includes(alias),
    );

    if (isConfigured && dependency.ensureToolsExposed) {
      // This would trigger tool exposure in real implementation
      // For now, just simulate the call
      const matchingAlias = dependency.aliases.find((alias) =>
        serverNames.includes(alias),
      );
      if (matchingAlias) {
        proxy.registry.enableTools(
          [`${matchingAlias}__*`],
          'server-dependency',
        );
      }
    }

    return { configured: isConfigured };
  }
}

describe('Server Dependency System', () => {
  let command: TestCommand;
  let mockProxy: MockMCPProxy;

  beforeEach(() => {
    command = new TestCommand();
    mockProxy = {
      getTargetServers: vi.fn(),
      registry: {
        enableTools: vi.fn(),
      },
    };
  });

  describe('requireServer method', () => {
    test.skip('should return configured true when server found by first alias', async () => {
      // Setup: Mock proxy with connected server matching first alias
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [
          ['github', { name: 'github', command: 'gh-mcp' }],
          ['filesystem', { name: 'filesystem', command: 'fs-mcp' }],
        ],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      const result = await command.requireServer(dependency);

      expect(result).toEqual({ configured: true });
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });

    test.skip('should return configured true when server found by second alias', async () => {
      // Setup: Mock proxy with connected server matching second alias
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [
          ['github-mcp', { name: 'github-mcp', command: 'gh-mcp' }],
          ['filesystem', { name: 'filesystem', command: 'fs-mcp' }],
        ],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      const result = await command.requireServer(dependency);

      expect(result).toEqual({ configured: true });
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });

    test.skip('should return configured true when server found by third alias', async () => {
      // Setup: Mock proxy with connected server matching third alias
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [
          ['gh', { name: 'gh', command: 'gh-mcp' }],
          ['filesystem', { name: 'filesystem', command: 'fs-mcp' }],
        ],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      const result = await command.requireServer(dependency);

      expect(result).toEqual({ configured: true });
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });

    test.skip('should return configured false when server not found', async () => {
      // Setup: Mock proxy with no matching servers
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [
          ['filesystem', { name: 'filesystem', command: 'fs-mcp' }],
          ['memory', { name: 'memory', command: 'memory-mcp' }],
        ],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      const result = await command.requireServer(dependency);

      expect(result).toEqual({ configured: false });
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });

    test.skip('should return undefined when no proxy available', async () => {
      // Setup: Command without proxy
      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp'],
        ensureToolsExposed: false,
      };

      const result = await command.requireServer(dependency);

      expect(result).toBeUndefined();
    });

    test.skip('should handle ensureToolsExposed flag when server is found', async () => {
      // Setup: Mock proxy with connected server
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [
          ['github', { name: 'github', command: 'gh-mcp' }],
          ['filesystem', { name: 'filesystem', command: 'fs-mcp' }],
        ],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp'],
        ensureToolsExposed: true,
      };

      const result = await command.requireServer(dependency);

      expect(result).toEqual({ configured: true });
      expect(mockProxy.registry.enableTools).toHaveBeenCalledWith(
        ['github__*'],
        'server-dependency',
      );
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });

    test.skip('should not call enableTools when ensureToolsExposed is false', async () => {
      // Setup: Mock proxy with connected server
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [['github', { name: 'github', command: 'gh-mcp' }]],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: false,
      };

      const result = await command.requireServer(dependency);

      expect(result).toEqual({ configured: true });
      expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test.skip('should not call enableTools when server is not found', async () => {
      // Setup: Mock proxy with no matching servers
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [['filesystem', { name: 'filesystem', command: 'fs-mcp' }]],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: true,
      };

      const result = await command.requireServer(dependency);

      expect(result).toEqual({ configured: false });
      expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test.skip('should handle multiple requireServer calls independently', async () => {
      // Setup: Mock proxy with multiple servers
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [
          ['github', { name: 'github', command: 'gh-mcp' }],
          ['filesystem', { name: 'filesystem', command: 'fs-mcp' }],
          ['memory', { name: 'memory', command: 'memory-mcp' }],
        ],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      // First call - GitHub dependency
      const githubDep: ServerDependency = {
        aliases: ['github', 'gh'],
        ensureToolsExposed: true,
      };

      const githubResult = await command.requireServer(githubDep);

      // Second call - Filesystem dependency
      const fsDep: ServerDependency = {
        aliases: ['filesystem', 'fs'],
        ensureToolsExposed: false,
      };

      const fsResult = await command.requireServer(fsDep);

      // Third call - Non-existent dependency
      const nonExistentDep: ServerDependency = {
        aliases: ['codex', 'codex-cli'],
        ensureToolsExposed: true,
      };

      const nonExistentResult = await command.requireServer(nonExistentDep);

      // Verify all results
      expect(githubResult).toEqual({ configured: true });
      expect(fsResult).toEqual({ configured: true });
      expect(nonExistentResult).toEqual({ configured: false });

      // Verify enableTools was called only for GitHub (ensureToolsExposed: true)
      expect(mockProxy.registry.enableTools).toHaveBeenCalledTimes(1);
      expect(mockProxy.registry.enableTools).toHaveBeenCalledWith(
        ['github__*'],
        'server-dependency',
      );

      // Verify getTargetServers was called for each requireServer call
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(3);
    });

    test.skip('should handle empty aliases array', async () => {
      // Setup: Mock proxy with servers
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [['github', { name: 'github', command: 'gh-mcp' }]],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: [], // Empty aliases
        ensureToolsExposed: false,
      };

      const result = await command.requireServer(dependency);

      expect(result).toEqual({ configured: false });
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });

    test.skip('should handle case-sensitive server name matching', async () => {
      // Setup: Mock proxy with servers
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [
          ['GitHub', { name: 'GitHub', command: 'gh-mcp' }], // Capital G
        ],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'], // lowercase
        ensureToolsExposed: false,
      };

      const result = await command.requireServer(dependency);

      // Should not match due to case sensitivity
      expect(result).toEqual({ configured: false });
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });

    test.skip('should handle servers in disconnected state', async () => {
      // Setup: Mock proxy with server in disconnected state
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [],
        disconnected: [
          [
            'github',
            { name: 'github', command: 'gh-mcp', error: 'Connection failed' },
          ],
        ],
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: false,
      };

      const result = await command.requireServer(dependency);

      // Should return false for disconnected servers
      expect(result).toEqual({ configured: false });
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });
  });

  describe('getServerDependencies method', () => {
    test.skip('should return declared server dependencies', () => {
      const dependencies = command.getServerDependencies();

      expect(dependencies).toEqual([
        {
          aliases: ['github', 'github-mcp'],
          ensureToolsExposed: true,
        },
        {
          aliases: ['filesystem', 'fs-mcp'],
          ensureToolsExposed: false,
        },
      ]);
    });

    test.skip('should return undefined for commands without dependencies', () => {
      class NoDepsCommand extends BaseCommand {
        readonly name = 'no-deps';
        readonly description = 'Command without dependencies';

        async executeToolViaMCP(): Promise<CallToolResult> {
          return { content: [{ type: 'text', text: 'test' }] };
        }

        async executeViaCLI(): Promise<void> {}

        getMCPDefinitions(): Tool[] {
          return [];
        }

        // No getServerDependencies method - should return undefined
      }

      const noDepsCommand = new NoDepsCommand();

      // TypeScript check: getServerDependencies should be optional
      const hasMethod = 'getServerDependencies' in noDepsCommand;
      expect(hasMethod).toBe(false);

      // If the method exists, it should return undefined
      if ('getServerDependencies' in noDepsCommand) {
        // Type assertion needed here for testing purposes since getServerDependencies is optional
        const cmdWithDeps = noDepsCommand as Partial<{
          getServerDependencies: () => ServerDependency[] | undefined;
        }>;
        const dependencies = cmdWithDeps.getServerDependencies?.();
        expect(dependencies).toBeUndefined();
      }
    });
  });

  describe('Type definitions', () => {
    test.skip('should validate ServerDependency interface', () => {
      const validDependency: ServerDependency = {
        aliases: ['github', 'gh'],
        ensureToolsExposed: true,
      };

      expect(validDependency.aliases).toBeInstanceOf(Array);
      expect(typeof validDependency.ensureToolsExposed).toBe('boolean');
    });

    test.skip('should validate ServerRequirementResult type', () => {
      const configuredResult: ServerRequirementResult = { configured: true };
      const notConfiguredResult: ServerRequirementResult = {
        configured: false,
      };
      const undefinedResult: ServerRequirementResult = undefined;

      expect(configuredResult).toEqual({ configured: true });
      expect(notConfiguredResult).toEqual({ configured: false });
      expect(undefinedResult).toBeUndefined();
    });

    test.skip('should allow optional ensureToolsExposed in ServerDependency', () => {
      const dependencyWithoutFlag: ServerDependency = {
        aliases: ['github'],
        // ensureToolsExposed is optional
      };

      const dependencyWithFlag: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: true,
      };

      expect(dependencyWithoutFlag.ensureToolsExposed).toBeUndefined();
      expect(dependencyWithFlag.ensureToolsExposed).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    test.skip('should support command validation workflow', async () => {
      // Setup: Mock proxy state
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [['github', { name: 'github', command: 'gh-mcp' }]],
        disconnected: [
          ['filesystem', { name: 'filesystem', command: 'fs-mcp' }],
        ],
      });

      command.setMockProxy(mockProxy);

      // Simulate command checking its dependencies
      const dependencies = command.getServerDependencies();
      expect(dependencies).toBeDefined();

      if (dependencies) {
        const results = await Promise.all(
          dependencies.map((dep) => command.requireServer(dep)),
        );

        // First dependency (github) should be configured
        expect(results[0]).toEqual({ configured: true });

        // Second dependency (filesystem) should not be configured (disconnected)
        expect(results[1]).toEqual({ configured: false });

        // Verify tool exposure was triggered for github only
        expect(mockProxy.registry.enableTools).toHaveBeenCalledWith(
          ['github__*'],
          'server-dependency',
        );
      }
    });

    test.skip('should handle commands with no proxy access gracefully', async () => {
      // Setup: Command without proxy (e.g., during CLI execution without MCP context)
      const dependencies = command.getServerDependencies();
      expect(dependencies).toBeDefined();

      if (dependencies) {
        const results = await Promise.all(
          dependencies.map((dep) => command.requireServer(dep)),
        );

        // All results should be undefined when no proxy is available
        results.forEach((result) => {
          expect(result).toBeUndefined();
        });
      }
    });

    test.skip('should demonstrate extensibility for future enhancements', () => {
      // This test validates that the current design can be extended
      // Future ServerRequirementResult could include additional fields like:
      // { configured: true, connected: true, toolsExposed: boolean, serverVersion: string }

      const currentResult: ServerRequirementResult = { configured: true };

      // The union type allows undefined, which maintains backward compatibility
      const futureUndefinedResult: ServerRequirementResult = undefined;

      // This demonstrates that the type is extensible - in the future we could add:
      // type ExtendedServerRequirementResult = {
      //   configured: boolean;
      //   connected?: boolean;
      //   toolsExposed?: boolean;
      //   serverVersion?: string;
      // } | undefined;

      expect(currentResult.configured).toBe(true);
      expect(futureUndefinedResult).toBeUndefined();
    });
  });
});
