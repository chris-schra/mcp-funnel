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
  hasServerConfigured(name: string): boolean;
  isServerConnected(name: string): boolean;
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

  // Test helper to access protected requireServerConfigured method
  async testRequireServerConfigured(
    dependency: ServerDependency,
  ): Promise<ServerRequirementResult> {
    return this.requireServerConfigured(dependency);
  }

  // Test helper to access protected requireServerConnected method
  async testRequireServerConnected(
    dependency: ServerDependency,
  ): Promise<ServerRequirementResult> {
    return this.requireServerConnected(dependency);
  }
}

describe('Server Dependency System', () => {
  let command: TestCommand;
  let mockProxy: MockMCPProxy;

  beforeEach(() => {
    command = new TestCommand();
    mockProxy = {
      getTargetServers: vi.fn(),
      hasServerConfigured: vi.fn(),
      isServerConnected: vi.fn(),
      registry: {
        enableTools: vi.fn(),
      },
    };
  });

  describe('requireServerConfigured method', () => {
    test('should return configured true when server found by first alias', async () => {
      // Setup: Mock proxy with configured server matching first alias
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['github', 'github-mcp', 'filesystem', 'fs-mcp'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.hasServerConfigured).toHaveBeenCalledWith('github');
    });

    test('should return configured true when server found by second alias', async () => {
      // When first alias is not configured, check second alias

      // Setup: Mock proxy with configured server matching second alias
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['github-mcp', 'filesystem', 'fs-mcp'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.hasServerConfigured).toHaveBeenCalledWith('github');
      expect(mockProxy.hasServerConfigured).toHaveBeenCalledWith('github-mcp');
    });

    test('should return configured true when server found by third alias', async () => {
      // Setup: Mock proxy with configured server matching third alias
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['gh', 'filesystem', 'fs-mcp'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.hasServerConfigured).toHaveBeenCalledWith('github');
      expect(mockProxy.hasServerConfigured).toHaveBeenCalledWith('github-mcp');
      expect(mockProxy.hasServerConfigured).toHaveBeenCalledWith('gh');
    });

    test('should return configured false when server not found', async () => {
      // Setup: Mock proxy with no matching servers
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['filesystem', 'memory'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toEqual({ configured: false });
    });

    test('should return undefined when no proxy available', async () => {
      // Setup: Command without proxy (don't call setMockProxy)
      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toBeUndefined();
    });

    test('should not handle ensureToolsExposed flag (configuration check only)', async () => {
      // requireServerConfigured only checks configuration, not connection
      // It should NOT call enableTools even if ensureToolsExposed is true
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['github', 'github-mcp', 'filesystem', 'fs-mcp'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp'],
        ensureToolsExposed: true,
      };

      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toEqual({ configured: true });
      // Should NOT call enableTools - that's only for requireServerConnected
      expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test('should not call enableTools when ensureToolsExposed is false', async () => {
      // Setup: Mock proxy with configured server
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['github'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test('should not call enableTools when server is not found', async () => {
      // Setup: Mock proxy with no matching servers
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['filesystem'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: true,
      };

      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toEqual({ configured: false });
      expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test('should handle multiple requireServerConfigured calls independently', async () => {
      // Multiple calls to requireServerConfigured should work independently
      // Each call should check current server state

      // Setup: Mock proxy with multiple servers
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['github', 'filesystem', 'memory'].includes(name);
      });

      command.setMockProxy(mockProxy);

      // Test data for multiple dependencies
      const githubDep: ServerDependency = {
        aliases: ['github', 'gh'],
        ensureToolsExposed: false, // Don't expose tools for this test
      };

      const fsDep: ServerDependency = {
        aliases: ['filesystem', 'fs'],
        ensureToolsExposed: false,
      };

      const nonExistentDep: ServerDependency = {
        aliases: ['codex', 'codex-cli'],
        ensureToolsExposed: false,
      };

      const githubResult = await command.testRequireServerConfigured(githubDep);
      const fsResult = await command.testRequireServerConfigured(fsDep);
      const nonExistentResult =
        await command.testRequireServerConfigured(nonExistentDep);

      expect(githubResult).toEqual({ configured: true });
      expect(fsResult).toEqual({ configured: true });
      expect(nonExistentResult).toEqual({ configured: false });

      // Should not call enableTools when ensureToolsExposed is false
      expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test('should handle empty aliases array', async () => {
      // Setup: Mock proxy with servers
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['github'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: [], // Empty aliases
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toEqual({ configured: false });
      expect(mockProxy.hasServerConfigured).not.toHaveBeenCalled();
    });

    test('should handle case-sensitive server name matching', async () => {
      // Setup: Mock proxy with servers
      vi.mocked(mockProxy.hasServerConfigured).mockImplementation((name) => {
        return ['GitHub'].includes(name); // Capital G
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'], // lowercase
        ensureToolsExposed: false,
      };

      // Should not match due to case sensitivity
      const result = await command.testRequireServerConfigured(dependency);
      expect(result).toEqual({ configured: false });
      expect(mockProxy.hasServerConfigured).toHaveBeenCalledWith('github');
    });
  });

  describe('requireServerConnected method', () => {
    test('should return configured true when server is connected', async () => {
      // Setup: Mock proxy with connected server
      vi.mocked(mockProxy.isServerConnected).mockImplementation((name) => {
        return ['github', 'filesystem'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConnected(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.isServerConnected).toHaveBeenCalledWith('github');
    });

    test('should return configured false when server is not connected', async () => {
      // Setup: Mock proxy with no connected servers matching aliases
      vi.mocked(mockProxy.isServerConnected).mockImplementation((name) => {
        return ['filesystem'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConnected(dependency);
      expect(result).toEqual({ configured: false });
    });

    test('should return undefined when no proxy available', async () => {
      // Setup: Command without proxy (don't call setMockProxy)
      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConnected(dependency);
      expect(result).toBeUndefined();
    });

    test('should handle ensureToolsExposed flag when server is connected', async () => {
      // Setup: Mock proxy with connected server
      vi.mocked(mockProxy.isServerConnected).mockImplementation((name) => {
        return ['github'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: true,
      };

      const result = await command.testRequireServerConnected(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.registry.enableTools).toHaveBeenCalledWith(
        ['github__*'],
        'server-dependency',
      );
    });

    test('should not call enableTools when ensureToolsExposed is false', async () => {
      // Setup: Mock proxy with connected server
      vi.mocked(mockProxy.isServerConnected).mockImplementation((name) => {
        return ['github'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConnected(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test('should not call enableTools when server is not connected', async () => {
      // Setup: Mock proxy with no connected servers
      vi.mocked(mockProxy.isServerConnected).mockImplementation(() => false);

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: true,
      };

      const result = await command.testRequireServerConnected(dependency);
      expect(result).toEqual({ configured: false });
      expect(mockProxy.registry.enableTools).not.toHaveBeenCalled();
    });

    test('should check all aliases until finding a connected server', async () => {
      // Setup: Mock proxy where second alias is connected
      vi.mocked(mockProxy.isServerConnected).mockImplementation((name) => {
        return ['github-mcp'].includes(name);
      });

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github', 'github-mcp', 'gh'],
        ensureToolsExposed: false,
      };

      const result = await command.testRequireServerConnected(dependency);
      expect(result).toEqual({ configured: true });
      expect(mockProxy.isServerConnected).toHaveBeenCalledWith('github');
      expect(mockProxy.isServerConnected).toHaveBeenCalledWith('github-mcp');
    });

    test('should handle disconnected state properly', async () => {
      // Setup: Mock proxy with server configured but not connected
      vi.mocked(mockProxy.isServerConnected).mockImplementation(() => false);

      command.setMockProxy(mockProxy);

      const dependency: ServerDependency = {
        aliases: ['github'],
        ensureToolsExposed: false,
      };

      // Should return false for disconnected servers
      const result = await command.testRequireServerConnected(dependency);
      expect(result).toEqual({ configured: false });
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
    test('should validate ServerDependency interface', () => {
      const validDependency: ServerDependency = {
        aliases: ['github', 'gh'],
        ensureToolsExposed: true,
      };

      expect(validDependency.aliases).toBeInstanceOf(Array);
      expect(typeof validDependency.ensureToolsExposed).toBe('boolean');
    });

    test('should validate ServerRequirementResult type', () => {
      const configuredResult: ServerRequirementResult = { configured: true };
      const notConfiguredResult: ServerRequirementResult = {
        configured: false,
      };
      const undefinedResult: ServerRequirementResult = undefined;

      expect(configuredResult).toEqual({ configured: true });
      expect(notConfiguredResult).toEqual({ configured: false });
      expect(undefinedResult).toBeUndefined();
    });

    test('should allow optional ensureToolsExposed in ServerDependency', () => {
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
    test('should support command validation workflow with requireServerConnected', async () => {
      // Commands should be able to check all their dependencies
      // and handle mixed results (some connected, some not)

      // Setup: Mock proxy state - github connected, filesystem not connected
      vi.mocked(mockProxy.isServerConnected).mockImplementation((name) => {
        return ['github'].includes(name); // Only github is connected
      });

      command.setMockProxy(mockProxy);

      // Command has predefined dependencies
      const dependencies = command.getServerDependencies();
      expect(dependencies).toBeDefined();

      if (dependencies) {
        const results = await Promise.all(
          dependencies.map((dep) => command.testRequireServerConnected(dep)),
        );

        // First dependency (github) should be connected
        expect(results[0]).toEqual({ configured: true });

        // Second dependency (filesystem) should not be connected
        expect(results[1]).toEqual({ configured: false });

        // Verify tool exposure was triggered for github only (ensureToolsExposed: true)
        expect(mockProxy.registry.enableTools).toHaveBeenCalledWith(
          ['github__*'],
          'server-dependency',
        );
      }
    });

    test('should handle commands with no proxy access gracefully', async () => {
      // Commands executed via CLI without MCP context should handle
      // missing proxy gracefully by returning undefined

      // Setup: Command without proxy (no setMockProxy called)
      const dependencies = command.getServerDependencies();
      expect(dependencies).toBeDefined();

      if (dependencies) {
        const configuredResults = await Promise.all(
          dependencies.map((dep) => command.testRequireServerConfigured(dep)),
        );
        const connectedResults = await Promise.all(
          dependencies.map((dep) => command.testRequireServerConnected(dep)),
        );

        // All results should be undefined when no proxy is available
        configuredResults.forEach((result) => {
          expect(result).toBeUndefined();
        });
        connectedResults.forEach((result) => {
          expect(result).toBeUndefined();
        });
      }
    });

    test('should demonstrate extensibility for future enhancements', () => {
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
