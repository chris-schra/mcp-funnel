import { Dirent } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ProxyConfig } from '../../config.js';
import { ToolRegistry } from '../../tool-registry.js';
import {
  discoverCommands,
  discoverAllCommands,
  type ICommand,
} from '@mcp-funnel/commands-core';
import { ICommandLoader } from '../interfaces/command-loader.interface.js';

export class CommandLoader implements ICommandLoader {
  async loadDevelopmentCommands(
    config: ProxyConfig,
    toolRegistry: ToolRegistry,
  ): Promise<void> {
    // Only load if explicitly enabled in config
    if (!config.commands?.enabled) return;

    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const commandsPath = join(__dirname, '../../../commands');

      const enabledCommands = config.commands.list || [];

      const registerFromRegistry = async (
        registry: Awaited<ReturnType<typeof discoverCommands>>,
      ) => {
        for (const commandName of registry.getAllCommandNames()) {
          const command = registry.getCommandForMCP(commandName);
          if (
            command &&
            (enabledCommands.length === 0 ||
              enabledCommands.includes(command.name))
          ) {
            await this.registerCommand(command, toolRegistry);
          }
        }
      };

      // 1) Bundled commands (only when the directory exists in this build)
      await this.loadBundledCommands(commandsPath, registerFromRegistry);

      // 2) Zero-config auto-scan for installed command packages under node_modules/@mcp-funnel
      await this.loadNodeModuleCommands(enabledCommands, toolRegistry);

      // 3) User-installed commands from ~/.mcp-funnel/packages
      await this.loadUserInstalledCommands(registerFromRegistry);
    } catch (error) {
      console.error('Failed to load commands:', error);
    }
  }

  private async loadBundledCommands(
    commandsPath: string,
    registerFromRegistry: (
      registry: Awaited<ReturnType<typeof discoverCommands>>,
    ) => Promise<void>,
  ): Promise<void> {
    try {
      const { existsSync } = await import('fs');
      if (existsSync(commandsPath)) {
        const bundledRegistry = await discoverCommands(commandsPath);
        await registerFromRegistry(bundledRegistry);
      }
    } catch {
      // ignore
    }
  }

  private async loadNodeModuleCommands(
    enabledCommands: string[],
    toolRegistry: ToolRegistry,
  ): Promise<void> {
    try {
      const scopeDir = join(process.cwd(), 'node_modules', '@mcp-funnel');
      const { readdirSync, existsSync } = await import('fs');
      if (!existsSync(scopeDir)) return;

      const entries = readdirSync(scopeDir, { withFileTypes: true });
      const packageDirs = entries
        .filter((e: Dirent) => e.isDirectory() && e.name.startsWith('command-'))
        .map((e: Dirent) => join(scopeDir, e.name));

      for (const pkgDir of packageDirs) {
        try {
          const command = await this.loadCommandFromPackage(pkgDir);
          if (
            command &&
            (enabledCommands.length === 0 ||
              enabledCommands.includes(command.name))
          ) {
            await this.registerCommand(command, toolRegistry);
          }
        } catch (_err) {
          // skip invalid package
          continue;
        }
      }
    } catch (_e) {
      // No scope directory or unreadable; ignore
    }
  }

  private async loadUserInstalledCommands(
    registerFromRegistry: (
      registry: Awaited<ReturnType<typeof discoverCommands>>,
    ) => Promise<void>,
  ): Promise<void> {
    try {
      const userRegistry = await discoverAllCommands(undefined, true);
      await registerFromRegistry(userRegistry);
    } catch (error) {
      console.warn('Failed to load user-installed commands:', error);
    }
  }

  private async loadCommandFromPackage(
    pkgDir: string,
  ): Promise<ICommand | null> {
    try {
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');
      const pkgJsonPath = join(pkgDir, 'package.json');
      if (!existsSync(pkgJsonPath)) return null;

      const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf-8')) as {
        module?: string;
        main?: string;
      };

      const entry = pkg.module || pkg.main;
      if (!entry) return null;

      const mod = await import(join(pkgDir, entry));
      const modObj = mod as Record<string, unknown>;
      const candidate = modObj.default || modObj.command;

      const chosen = this.isValidCommand(candidate)
        ? candidate
        : (Object.values(modObj).find(this.isValidCommand) as
            | ICommand
            | undefined);

      return chosen || null;
    } catch {
      return null;
    }
  }

  private async registerCommand(
    command: ICommand,
    toolRegistry: ToolRegistry,
  ): Promise<void> {
    const mcpDefs = command.getMCPDefinitions();
    const isSingle = mcpDefs.length === 1;
    const singleMatchesCommand = isSingle && mcpDefs[0]?.name === command.name;

    for (const mcpDef of mcpDefs) {
      const useCompact = singleMatchesCommand && mcpDef.name === command.name;
      const displayName = useCompact
        ? `${command.name}`
        : `${command.name}_${mcpDef.name}`;

      if (!mcpDef.description) {
        throw new Error(
          `Tool ${mcpDef.name} from command ${command.name} is missing a description`,
        );
      }

      // Register command tool in the registry
      toolRegistry.registerDiscoveredTool({
        fullName: displayName,
        originalName: mcpDef.name,
        serverName: 'commands',
        definition: { ...mcpDef, name: displayName },
        command,
      });
    }
  }

  private isValidCommand(obj: unknown): obj is ICommand {
    if (!obj || typeof obj !== 'object') return false;
    const c = obj as Record<string, unknown>;
    return (
      typeof c.name === 'string' &&
      typeof c.description === 'string' &&
      typeof c.executeToolViaMCP === 'function' &&
      typeof c.executeViaCLI === 'function' &&
      typeof c.getMCPDefinitions === 'function'
    );
  }
}
