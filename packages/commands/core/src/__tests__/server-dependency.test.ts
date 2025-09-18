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

  async executeToolViaMCP(
    toolName: string,
    _args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    return {
      content: [{ type: 'text', text: `Executed ${toolName}` }],
    };
  }

  async executeViaCLI(_args: string[]): Promise<void> {
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

  // Test helper to set mock proxy (use the real setProxy method from BaseCommand)
  setMockProxy(proxy: MockMCPProxy): void {
    this.setProxy(proxy);
  }

  // Test helper to access protected requireServer method
  async testRequireServer(
    dependency: ServerDependency,
  ): Promise<ServerRequirementResult> {
    return this.requireServer(dependency);
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
    test('should return configured true when server found by first alias', async () => {
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

      const result = await command.testRequireServer(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });

    test.skip('should return configured true when server found by second alias', async () => {
      // When implemented, requireServer should check all aliases in order

      // Setup: Mock proxy with connected server matching second alias
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [
          ['github-mcp', { name: 'github-mcp', command: 'gh-mcp' }],
          ['filesystem', { name: 'filesystem', command: 'fs-mcp' }],
        ],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const _dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      // Expected behavior:
      // const result = await command.requireServer(_dependency);
      // expect(result).toEqual({ configured: true });
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

      const _dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      // Expected behavior:
      // const result = await command.requireServer(_dependency);
      // expect(result).toEqual({ configured: true });
      // expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });

    test('should return configured false when server not found', async () => {
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

      const result = await command.testRequireServer(dependency);
      expect(result).toEqual({ configured: false });
    });

    test('should return undefined when no proxy available', async () => {
      // Setup: Command without proxy (don't call setMockProxy)
      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServer(dependency);
      expect(result).toBeUndefined();
    });

    test('should handle ensureToolsExposed flag when server is found', async () => {
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

      const result = await command.testRequireServer(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.registry.enableTools).toHaveBeenCalledWith(
        ['github__*'],
        'server-dependency',
      );
    });

    test.skip('should not call enableTools when ensureToolsExposed is false', async () => {
      // Setup: Mock proxy with connected server
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [['github', { name: 'github', command: 'gh-mcp' }]],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const _dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: false,
      };

      // Expected behavior:
      // const result = await command.requireServer(_dependency);
      // expect(result).toEqual({ configured: true });
      // expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test.skip('should not call enableTools when server is not found', async () => {
      // Setup: Mock proxy with no matching servers
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [['filesystem', { name: 'filesystem', command: 'fs-mcp' }]],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const _dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: true,
      };

      // Expected behavior:
      // const result = await command.requireServer(_dependency);
      // expect(result).toEqual({ configured: false });
      // expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test.skip('should handle multiple requireServer calls independently', async () => {
      // Multiple calls to requireServer should work independently
      // Each call should check current server state

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

      // Test data for multiple dependencies
      const _githubDep: ServerDependency = {
        aliases: ['github', 'gh'],
        ensureToolsExposed: true,
      };

      const _fsDep: ServerDependency = {
        aliases: ['filesystem', 'fs'],
        ensureToolsExposed: false,
      };

      const _nonExistentDep: ServerDependency = {
        aliases: ['codex', 'codex-cli'],
        ensureToolsExposed: true,
      };

      // Expected behavior when requireServer is implemented:
      // const githubResult = await command.requireServer(_githubDep);
      // const fsResult = await command.requireServer(_fsDep);
      // const nonExistentResult = await command.requireServer(_nonExistentDep);
      //
      // expect(githubResult).toEqual({ configured: true });
      // expect(fsResult).toEqual({ configured: true });
      // expect(nonExistentResult).toEqual({ configured: false });
      //
      // expect(mockProxy.registry.enableTools).toHaveBeenCalledTimes(1);
      // expect(mockProxy.registry.enableTools).toHaveBeenCalledWith(
      //   ['github__*'],
      //   'server-dependency',
      // );
    });

    test.skip('should handle empty aliases array', async () => {
      // Setup: Mock proxy with servers
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [['github', { name: 'github', command: 'gh-mcp' }]],
        disconnected: [],
      });

      command.setMockProxy(mockProxy);

      const _dependency: ServerDependency = {
        aliases: [], // Empty aliases
        ensureToolsExposed: false,
      };

      // Expected behavior:
      // const result = await command.requireServer(_dependency);
      // expect(result).toEqual({ configured: false });
      // expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
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

      const _dependency: ServerDependency = {
        aliases: ['github'], // lowercase
        ensureToolsExposed: false,
      };

      // Expected behavior (should not match due to case sensitivity):
      // const result = await command.requireServer(_dependency);
      // expect(result).toEqual({ configured: false });
      // expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
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

      const _dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: false,
      };

      // Expected behavior (should return false for disconnected servers):
      // const result = await command.requireServer(_dependency);
      // expect(result).toEqual({ configured: false });
      // expect(mockProxy.getTargetServers).toHaveBeenCalledTimes(1);
    });
  });

  describe('getServerDependencies method', () => {
    test('should return declared server dependencies', () => {
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

    test('should return undefined for commands without dependencies', () => {
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

        // No getServerDependencies override - should return undefined from base class
      }

      const noDepsCommand = new NoDepsCommand();

      // The method exists on BaseCommand with default implementation
      const dependencies = noDepsCommand.getServerDependencies();
      expect(dependencies).toBeUndefined();
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
      // Commands should be able to check all their dependencies
      // and handle mixed results (some configured, some not)

      // Setup: Mock proxy state
      vi.mocked(mockProxy.getTargetServers).mockReturnValue({
        connected: [['github', { name: 'github', command: 'gh-mcp' }]],
        disconnected: [
          ['filesystem', { name: 'filesystem', command: 'fs-mcp' }],
        ],
      });

      command.setMockProxy(mockProxy);

      // Command has predefined dependencies
      const dependencies = command.getServerDependencies();
      expect(dependencies).toBeDefined();

      // Expected behavior when requireServer is implemented:
      // if (dependencies) {
      //   const results = await Promise.all(
      //     dependencies.map((_dep) => command.requireServer(_dep)),
      //   );
      //
      //   // First dependency (github) should be configured
      //   expect(results[0]).toEqual({ configured: true });
      //
      //   // Second dependency (filesystem) should not be configured (disconnected)
      //   expect(results[1]).toEqual({ configured: false });
      //
      //   // Verify tool exposure was triggered for github only
      //   expect(mockProxy.registry.enableTools).toHaveBeenCalledWith(
      //     ['github__*'],
      //     'server-dependency',
      //   );
      // }
    });

    test.skip('should handle commands with no proxy access gracefully', async () => {
      // Commands executed via CLI without MCP context should handle
      // missing proxy gracefully by returning undefined

      // Setup: Command without proxy (no setMockProxy called)
      const dependencies = command.getServerDependencies();
      expect(dependencies).toBeDefined();

      // Expected behavior when requireServer is implemented:
      // if (dependencies) {
      //   const results = await Promise.all(
      //     dependencies.map((_dep) => command.requireServer(_dep)),
      //   );
      //
      //   // All results should be undefined when no proxy is available
      //   results.forEach((result) => {
      //     expect(result).toBeUndefined();
      //   });
      // }
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
