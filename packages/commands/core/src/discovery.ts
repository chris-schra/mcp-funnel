/**
 * Command discovery utilities for MCP Funnel commands.
 *
 * Provides functions to discover and load command packages from various locations:
 * - Default bundled commands directory
 * - Custom search paths
 * - User-installed commands from ~/.mcp-funnel
 * @internal
 * @see file:./interfaces.ts - ICommand interface definition
 * @see file:./registry.ts - CommandRegistry implementation
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import type { ICommand } from './interfaces.js';
import { CommandRegistry } from './registry.js';

/**
 * Discovers and loads commands from the default commands directory.
 *
 * Navigates from the core/src directory to the parent tools directory
 * (two levels up) to discover bundled commands.
 * @returns Promise resolving to CommandRegistry containing all discovered commands
 * @example
 * ```typescript
 * const registry = await discoverCommandsFromDefault();
 * console.log(`Found ${registry.size()} commands`);
 * ```
 * @public
 * @see file:./registry.ts:11 - CommandRegistry class
 */
export async function discoverCommandsFromDefault(): Promise<CommandRegistry> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Navigate from core/src to the parent tools directory
  const defaultPath = join(__dirname, '..', '..');
  return discoverCommands(defaultPath);
}

/**
 * Discovers and loads commands from a specified directory path.
 *
 * Scans the given directory for subdirectories (excluding 'core') and attempts
 * to load each as a command package. Invalid or failed command loads are logged
 * as warnings but do not prevent other commands from loading.
 * @param searchPath - Absolute path to directory containing command packages
 * @returns Promise resolving to CommandRegistry with all successfully loaded commands
 * @example
 * ```typescript
 * const registry = await discoverCommands('/path/to/commands');
 * for (const name of registry.getAllCommandNames()) {
 *   console.log(`Discovered command: ${name}`);
 * }
 * ```
 * @public
 * @see file:./registry.ts:11 - CommandRegistry class
 */
export async function discoverCommands(
  searchPath: string,
): Promise<CommandRegistry> {
  const registry = new CommandRegistry();

  try {
    const entries = await fs.readdir(searchPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'core') {
        const commandPath = join(searchPath, entry.name);

        try {
          const command = await loadCommand(commandPath);
          if (command) {
            registry.register(command);
          }
        } catch (error) {
          console.warn(`Failed to load command from ${commandPath}:`, error);
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to discover commands in ${searchPath}:`, error);
  }

  return registry;
}

/**
 * Discovers commands from multiple locations including project-local and user-installed commands.
 *
 * Attempts to load commands from:
 * 1. Project-local directory (if projectPath provided)
 * 2. User-installed commands from ~/.mcp-funnel (if includeUserCommands is true)
 *
 * User commands are loaded from ~/.mcp-funnel/commands-manifest.json which tracks
 * installed command packages. If the manifest doesn't exist, no user commands are loaded
 * but the function continues successfully.
 * @param projectPath - Optional path to project-local commands directory
 * @param includeUserCommands - Whether to include user-installed commands from ~/.mcp-funnel
 * @returns Promise resolving to CommandRegistry containing all discovered commands
 * @example
 * ```typescript
 * // Load all commands including user-installed
 * const registry = await discoverAllCommands('./packages/commands');
 *
 * // Load only project commands
 * const projectOnly = await discoverAllCommands('./packages/commands', false);
 *
 * // Load only user-installed commands
 * const userOnly = await discoverAllCommands(undefined, true);
 * ```
 * @public
 * @see file:./registry.ts:11 - CommandRegistry class
 */
export async function discoverAllCommands(
  projectPath?: string,
  includeUserCommands = true,
): Promise<CommandRegistry> {
  const registry = new CommandRegistry();

  // 1. Load project-local commands (if project path provided)
  if (projectPath) {
    try {
      const projectRegistry = await discoverCommands(projectPath);
      for (const commandName of projectRegistry.getAllCommandNames()) {
        const command = projectRegistry.getCommandForMCP(commandName);
        if (command) {
          registry.register(command);
        }
      }
    } catch (error) {
      console.warn(
        `Failed to discover project commands from ${projectPath}:`,
        error,
      );
    }
  }

  // 2. Load user-installed commands from ~/.mcp-funnel using the manifest
  if (includeUserCommands) {
    const manifestPath = join(
      homedir(),
      '.mcp-funnel',
      'commands-manifest.json',
    );
    const userPackagesPath = join(
      homedir(),
      '.mcp-funnel',
      'packages',
      'node_modules',
    );

    try {
      // Read the manifest to know what commands are actually installed
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent) as {
        commands: Array<{
          name: string;
          package: string;
          version: string;
          description?: string;
          installedAt: string;
        }>;
      };

      // Load each command from the manifest
      for (const installedCmd of manifest.commands) {
        const commandPath = join(userPackagesPath, installedCmd.package);
        try {
          const command = await loadCommand(commandPath);
          if (command) {
            registry.register(command);
          } else {
            console.warn(
              `Command ${installedCmd.name} from package ${installedCmd.package} could not be loaded`,
            );
          }
        } catch (error) {
          console.warn(
            `Failed to load user command ${installedCmd.name} from ${commandPath}:`,
            error,
          );
        }
      }
    } catch (error) {
      // Manifest doesn't exist yet, that's okay - no commands installed
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Failed to read user commands manifest:', error);
      }
    }
  }

  return registry;
}

/**
 * Loads a single command from a package directory.
 *
 * Attempts to load a command in the following order:
 * 1. src/index.ts (in development mode or when MCP_FUNNEL_PREFER_SRC=1)
 * 2. Entry point specified in package.json (module or main field)
 * 3. Fallback to src/index.ts if entry point fails
 *
 * The function looks for exports in this priority:
 * - module.default
 * - module.command
 * - Any export implementing ICommand interface
 * @param commandPath - Absolute path to command package directory
 * @returns Promise resolving to ICommand if valid command found, null otherwise
 * @remarks
 * This function silently handles missing files and invalid packages by returning null
 * rather than throwing. Warnings are logged to console for debugging.
 * @internal
 * @see file:./interfaces.ts:8 - ICommand interface definition
 */
async function loadCommand(commandPath: string): Promise<ICommand | null> {
  try {
    const packageJson = await readPackageJson(commandPath);
    if (!packageJson) return null;

    const entryPoint = packageJson.module || packageJson.main;
    if (!entryPoint) {
      console.warn(
        `No main/module entry point found in package.json at ${commandPath}`,
      );
      return null;
    }

    const pathsToTry = getModulePathsToTry(commandPath, entryPoint);

    for (const modulePath of pathsToTry) {
      const command = await tryLoadCommandFromPath(modulePath);
      if (command) return command;
    }

    console.warn(`Could not import command from ${commandPath}`);
  } catch (error) {
    console.warn(`Invalid command package at ${commandPath}:`, error);
  }

  return null;
}

/**
 * Reads and parses package.json from a command directory.
 * @param commandPath - Path to command package directory
 * @returns Parsed package.json object or null if failed
 * @internal
 */
async function readPackageJson(
  commandPath: string,
): Promise<{ module?: string; main?: string } | null> {
  const packageJsonPath = join(commandPath, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf-8').catch((error) => {
    console.warn(`Failed to load command from ${commandPath}:`, error);
    return null;
  });

  if (!content) return null;
  return JSON.parse(content);
}

/**
 * Determines the ordered list of module paths to attempt loading.
 * @param commandPath - Path to command package directory
 * @param entryPoint - Entry point from package.json
 * @returns Array of absolute paths to try in order
 * @internal
 */
function getModulePathsToTry(
  commandPath: string,
  entryPoint: string,
): string[] {
  const preferSrc =
    process.env.NODE_ENV !== 'production' ||
    process.env.MCP_FUNNEL_PREFER_SRC === '1';

  const srcPath = join(commandPath, 'src', 'index.ts');
  const distPath = join(commandPath, entryPoint);

  return preferSrc ? [srcPath, distPath] : [distPath, srcPath];
}

/**
 * Attempts to load and extract a command from a module path.
 * @param modulePath - Absolute path to module file
 * @returns ICommand if found and valid, null otherwise
 * @internal
 */
async function tryLoadCommandFromPath(
  modulePath: string,
): Promise<ICommand | null> {
  try {
    await fs.access(modulePath);
    const module = await import(modulePath);
    const command =
      module.default || module.command || findCommandInModule(module);

    if (isValidCommand(command)) {
      return command as ICommand;
    }
  } catch {
    // Failed to load from this path, caller will try next
  }

  return null;
}

/**
 * Searches a module's exports for an object implementing ICommand interface.
 *
 * Iterates through all named exports looking for the first export that
 * satisfies the ICommand interface contract.
 * @param module - Module object whose exports should be searched
 * @returns First valid ICommand found, or null if none found
 * @internal
 * @see file:./interfaces.ts:8 - ICommand interface definition
 */
function findCommandInModule(module: unknown): ICommand | null {
  // Look for any export that looks like a command
  if (module && typeof module === 'object') {
    for (const [_key, value] of Object.entries(module)) {
      if (isValidCommand(value)) {
        return value as ICommand;
      }
    }
  }
  return null;
}

/**
 * Validates that an object implements the ICommand interface.
 *
 * Performs runtime type checking to verify an object has all required
 * ICommand properties with correct types:
 * - name: string
 * - description: string
 * - executeToolViaMCP: function
 * - executeViaCLI: function
 * - getMCPDefinitions: function
 * @param command - Object to validate
 * @returns Type predicate indicating if command implements ICommand
 * @internal
 * @see file:./interfaces.ts:8 - ICommand interface definition
 */
function isValidCommand(command: unknown): command is ICommand {
  if (command == null || typeof command !== 'object') {
    return false;
  }

  const c = command as Record<string, unknown>;

  return (
    typeof c.name === 'string' &&
    typeof c.description === 'string' &&
    typeof c.executeToolViaMCP === 'function' &&
    typeof c.executeViaCLI === 'function' &&
    typeof c.getMCPDefinitions === 'function'
  );
}
