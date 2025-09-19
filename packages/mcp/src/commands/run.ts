import { discoverCommands, CommandRegistry } from '@mcp-funnel/commands-core';
import { Dirent } from 'fs';
import { resolve, dirname, join } from 'path';
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

    // 1) Local development folder: <cwd>/packages/commands (monorepo style)
    const localCommandsPath = resolve(process.cwd(), 'packages/commands');
    try {
      const { existsSync } = await import('fs');
      if (existsSync(localCommandsPath)) {
        const localRegistry = await discoverCommands(localCommandsPath);
        for (const cmd of localRegistry.getAllCommandNames()) {
          const c = localRegistry.getCommandForCLI(cmd);
          if (c) registry.register(c);
        }
      }
    } catch {
      // ignore if not present
    }

    // 2) Bundled commands path (when running from source)
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const bundledPath = resolve(__dirname, '../../../commands');
      const { existsSync } = await import('fs');
      if (existsSync(bundledPath)) {
        const bundled = await discoverCommands(bundledPath);
        for (const cmd of bundled.getAllCommandNames()) {
          const c = bundled.getCommandForCLI(cmd);
          if (c) registry.register(c);
        }
      }
    } catch {
      // ignore
    }

    // 3) Zero-config auto-scan for installed command packages under node_modules/@mcp-funnel
    try {
      const scopeDir = resolve(process.cwd(), 'node_modules', '@mcp-funnel');
      const { readdirSync, existsSync } = await import('fs');
      if (existsSync(scopeDir)) {
        const entries = readdirSync(scopeDir, { withFileTypes: true });
        const packageDirs = entries
          .filter(
            (e: Dirent) => e.isDirectory() && e.name.startsWith('command-'),
          )
          .map((e: Dirent) => join(scopeDir, e.name));

        const isValidCommand = (
          obj: unknown,
        ): obj is import('@mcp-funnel/commands-core').ICommand => {
          if (!obj || typeof obj !== 'object') return false;
          const c = obj as Record<string, unknown>;
          return (
            typeof c.name === 'string' &&
            typeof c.description === 'string' &&
            typeof c.executeToolViaMCP === 'function' &&
            typeof c.executeViaCLI === 'function' &&
            typeof c.getMCPDefinitions === 'function'
          );
        };

        for (const pkgDir of packageDirs) {
          try {
            const pkgJsonPath = join(pkgDir, 'package.json');
            if (!existsSync(pkgJsonPath)) continue;
            const { readFile } = await import('fs/promises');
            const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf-8')) as {
              module?: string;
              main?: string;
            };
            const entry = pkg.module || pkg.main;
            if (!entry) continue;
            const mod = await import(join(pkgDir, entry));
            const modObj = mod as Record<string, unknown>;
            const candidate =
              modObj.default || modObj.command || Object.values(modObj)[0];
            if (isValidCommand(candidate)) {
              registry.register(candidate);
            }
          } catch {
            // skip invalid package
            continue;
          }
        }
      }
    } catch {
      // ignore
    }

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
