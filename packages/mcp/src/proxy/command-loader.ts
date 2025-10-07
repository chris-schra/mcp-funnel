/**
 * Command loading and registration logic
 * Extracted from MCPProxy to reduce file size and improve maintainability
 * @internal
 */

import { Dirent } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { discoverCommands, discoverAllCommands, type ICommand } from '@mcp-funnel/commands-core';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import type { ToolRegistry } from '../tool-registry/index.js';

/**
 * Type guard to validate if an object is a valid ICommand
 * @param obj - Object to validate
 * @returns True if object implements ICommand interface
 * @internal
 */
function isValidCommand(obj: unknown): obj is ICommand {
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

/**
 * Register tools from a command registry
 * @param registry - Command registry containing discovered commands
 * @param enabledCommands - List of command names to enable (empty array enables all)
 * @param toolRegistry - Tool registry for registering discovered tools
 * @internal
 */
async function registerFromRegistry(
  registry: Awaited<ReturnType<typeof discoverCommands>>,
  enabledCommands: string[],
  toolRegistry: ToolRegistry,
): Promise<void> {
  for (const commandName of registry.getAllCommandNames()) {
    const command = registry.getCommandForMCP(commandName);
    if (command && (enabledCommands.length === 0 || enabledCommands.includes(command.name))) {
      const mcpDefs = command.getMCPDefinitions();
      const isSingle = mcpDefs.length === 1;
      const singleMatchesCommand = isSingle && mcpDefs[0]?.name === command.name;

      for (const mcpDef of mcpDefs) {
        const useCompact = singleMatchesCommand && mcpDef.name === command.name;
        const displayName = useCompact ? `${command.name}` : `${command.name}_${mcpDef.name}`;

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
  }
}

/**
 * Load bundled commands from the commands directory
 * @param enabledCommands - List of command names to enable (empty array enables all)
 * @param toolRegistry - Tool registry for registering discovered tools
 * @internal
 */
async function loadBundledCommands(
  enabledCommands: string[],
  toolRegistry: ToolRegistry,
): Promise<void> {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const commandsPath = join(__dirname, '../../../commands');

    const { existsSync } = await import('fs');
    if (existsSync(commandsPath)) {
      const bundledRegistry = await discoverCommands(commandsPath);
      await registerFromRegistry(bundledRegistry, enabledCommands, toolRegistry);
    }
  } catch {
    // Ignore - bundled commands directory may not exist
  }
}

/**
 * Load command packages installed under node_modules/\@mcp-funnel
 * @param enabledCommands - List of command names to enable (empty array enables all)
 * @param toolRegistry - Tool registry for registering discovered tools
 * @internal
 */
async function loadInstalledCommandPackages(
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
        const candidate = modObj.default || modObj.command;
        const chosen = isValidCommand(candidate)
          ? candidate
          : (Object.values(modObj).find(isValidCommand) as ICommand | undefined);

        if (chosen && (enabledCommands.length === 0 || enabledCommands.includes(chosen.name))) {
          const mcpDefs = chosen.getMCPDefinitions();
          const isSingle = mcpDefs.length === 1;
          const singleMatchesCommand = isSingle && mcpDefs[0]?.name === chosen.name;

          for (const mcpDef of mcpDefs) {
            const useCompact = singleMatchesCommand && mcpDef.name === chosen.name;
            const displayName = useCompact ? `${chosen.name}` : `${chosen.name}_${mcpDef.name}`;

            if (!mcpDef.description) {
              throw new Error(
                `Tool ${mcpDef.name} from command ${chosen.name} is missing a description`,
              );
            }

            toolRegistry.registerDiscoveredTool({
              fullName: displayName,
              originalName: mcpDef.name,
              serverName: 'commands',
              definition: { ...mcpDef, name: displayName },
              command: chosen,
            });
          }
        }
      } catch (_err) {
        // Skip invalid packages
        continue;
      }
    }
  } catch (_e) {
    // No scope directory or unreadable; ignore
  }
}

/**
 * Load user-installed commands from ~/.mcp-funnel/packages
 * @param enabledCommands - List of command names to enable (empty array enables all)
 * @param toolRegistry - Tool registry for registering discovered tools
 * @internal
 */
async function loadUserCommands(
  enabledCommands: string[],
  toolRegistry: ToolRegistry,
): Promise<void> {
  try {
    const userRegistry = await discoverAllCommands(undefined, true);
    await registerFromRegistry(userRegistry, enabledCommands, toolRegistry);
  } catch (error) {
    console.warn('Failed to load user-installed commands:', error);
  }
}

/**
 * Main entry point: Load all commands based on configuration
 * @param config - Proxy configuration containing command settings
 * @param toolRegistry - Tool registry for registering discovered tools
 * @internal
 */
export async function loadDevelopmentCommands(
  config: ProxyConfig,
  toolRegistry: ToolRegistry,
): Promise<void> {
  // Only load if explicitly enabled in config
  if (!config.commands?.enabled) return;

  try {
    const enabledCommands = config.commands.list || [];

    await Promise.all([
      loadBundledCommands(enabledCommands, toolRegistry),
      loadInstalledCommandPackages(enabledCommands, toolRegistry),
      loadUserCommands(enabledCommands, toolRegistry),
    ]);
  } catch (error) {
    console.error('Failed to load commands:', error);
  }
}
