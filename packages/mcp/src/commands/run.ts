import { CommandRegistry } from '@mcp-funnel/commands-core';
import { discoverCommandsFromPaths } from '../shared-command-discovery.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getDefaultProjectConfigPath,
  resolveMergedProxyConfig,
} from '../config-loader.js';
import { normalizeServers } from '../config.js';
import type { IMCPProxy } from '@mcp-funnel/commands-core';

// Minimal proxy implementation for CLI execution
// Only provides configuration checking, not connection management
class CLIProxy implements IMCPProxy {
  private configuredServers: string[] = [];

  constructor(configPath: string) {
    try {
      const config = resolveMergedProxyConfig(configPath);
      const normalized = normalizeServers(config.config.servers);
      this.configuredServers = normalized.map((s) => s.name);
    } catch {
      // If config can't be loaded, no servers are configured
      this.configuredServers = [];
    }
  }

  getTargetServers() {
    // CLI mode doesn't manage connections
    return {
      connected: [],
      disconnected: [],
    };
  }

  hasServerConfigured(name: string): boolean {
    return this.configuredServers.includes(name);
  }

  isServerConnected(_name: string): boolean {
    // In CLI mode, servers are never connected through the proxy
    return false;
  }

  registry = undefined; // No registry in CLI mode
}

export async function runCommand(name: string, args: string[]): Promise<void> {
  try {
    const registry = new CommandRegistry();

    // Define search paths
    const localCommandsPath = resolve(process.cwd(), 'packages/commands');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const bundledPath = resolve(__dirname, '../../../commands');
    const scopeDir = resolve(process.cwd(), 'node_modules', '@mcp-funnel');

    // Use shared command discovery logic
    await discoverCommandsFromPaths({
      paths: {
        local: localCommandsPath,
        bundled: bundledPath,
        nodeModulesScope: scopeDir,
      },
      context: 'cli',
      onCommandFound: (command) => {
        registry.register(command);
      },
    });

    const command = registry.getCommandForCLI(name);
    if (!command) {
      console.error(`Command not found: ${name}`);
      console.error(
        `Available commands: ${registry.getAllCommandNames().join(', ')}`,
      );
      process.exit(1);
    }

    // Provide proxy access for server dependency checking
    if (typeof command.setProxy === 'function') {
      const configPath = getDefaultProjectConfigPath();
      const cliProxy = new CLIProxy(configPath);
      command.setProxy(cliProxy);
    }

    // Execute command via CLI interface
    await command.executeViaCLI(args);
  } catch (error) {
    console.error('Failed to run command:', error);
    process.exit(1);
  }
}
