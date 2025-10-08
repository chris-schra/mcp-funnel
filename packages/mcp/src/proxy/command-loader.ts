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
 * Register a single command's tools with the tool registry
 * @param command - Command to register
 * @param toolRegistry - Tool registry for registering discovered tools
 * @internal
 */
function registerCommandTools(command: ICommand, toolRegistry: ToolRegistry): void {
  const mcpDefs = command.getMCPDefinitions();
  const isSingle = mcpDefs.length === 1;
  const singleMatchesCommand = isSingle && mcpDefs[0]?.name === command.name;

  for (const mcpDef of mcpDefs) {
    const useCompact = singleMatchesCommand && mcpDef.name === command.name;
    const displayName = useCompact ? `${command.name}` : `${command.name}_${mcpDef.name}`;

    if (!mcpDef.description) {
      throw new Error(`Tool ${mcpDef.name} from command ${command.name} is missing a description`);
    }

    toolRegistry.registerDiscoveredTool({
      fullName: displayName,
      originalName: mcpDef.name,
      serverName: 'commands',
      definition: { ...mcpDef, name: displayName },
      command,
    });
  }
}

/**
 * Check if a command should be enabled based on the enabled commands list
 * @param command - Command to check
 * @param enabledCommands - List of enabled command names (empty array enables all)
 * @returns True if command should be enabled
 * @internal
 */
function shouldEnableCommand(command: ICommand, enabledCommands: string[]): boolean {
  return enabledCommands.length === 0 || enabledCommands.includes(command.name);
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
    if (command && shouldEnableCommand(command, enabledCommands)) {
      registerCommandTools(command, toolRegistry);
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
 * Get list of command package directories under a scope
 * @param scopeDir - Path to the scoped package directory
 * @param readdirSync - fs.readdirSync function
 * @returns Array of package directory paths
 * @internal
 */
function getCommandPackageDirs(
  scopeDir: string,
  readdirSync: (path: string, options: { withFileTypes: true }) => Dirent[],
): string[] {
  const entries = readdirSync(scopeDir, { withFileTypes: true });
  return entries
    .filter((e: Dirent) => e.isDirectory() && e.name.startsWith('command-'))
    .map((e: Dirent) => join(scopeDir, e.name));
}

/**
 * Read package.json and resolve entry point
 * @param pkgDir - Package directory path
 * @returns Entry point path or null if not found
 * @internal
 */
async function resolvePackageEntry(pkgDir: string): Promise<string | null> {
  const pkgJsonPath = join(pkgDir, 'package.json');
  const { existsSync } = await import('fs');

  if (!existsSync(pkgJsonPath)) return null;

  const { readFile } = await import('fs/promises');
  const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf-8')) as {
    module?: string;
    main?: string;
  };

  const entry = pkg.module || pkg.main;
  return entry ? join(pkgDir, entry) : null;
}

/**
 * Extract and validate command from an imported module
 * @param mod - Imported module object
 * @returns Valid ICommand or null
 * @internal
 */
function extractCommandFromModule(mod: unknown): ICommand | null {
  const modObj = mod as Record<string, unknown>;
  const candidate = modObj.default || modObj.command;

  if (isValidCommand(candidate)) return candidate;

  const found = Object.values(modObj).find(isValidCommand);
  return found ? (found as ICommand) : null;
}

/**
 * Load and register a single command package
 * @param pkgDir - Package directory path
 * @param enabledCommands - List of enabled command names
 * @param toolRegistry - Tool registry for registering discovered tools
 * @internal
 */
async function loadCommandPackage(
  pkgDir: string,
  enabledCommands: string[],
  toolRegistry: ToolRegistry,
): Promise<void> {
  const entryPath = await resolvePackageEntry(pkgDir);
  if (!entryPath) return;

  const mod = await import(entryPath);
  const command = extractCommandFromModule(mod);

  if (command && shouldEnableCommand(command, enabledCommands)) {
    registerCommandTools(command, toolRegistry);
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
    const { existsSync, readdirSync } = await import('fs');

    if (!existsSync(scopeDir)) return;

    const packageDirs = getCommandPackageDirs(scopeDir, readdirSync);

    for (const pkgDir of packageDirs) {
      try {
        await loadCommandPackage(pkgDir, enabledCommands, toolRegistry);
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
