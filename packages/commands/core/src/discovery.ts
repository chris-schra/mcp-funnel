/**
 * Command discovery utilities for MCP Funnel commands
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ICommand } from './interfaces.js';
import { CommandRegistry } from './registry.js';

/**
 * Discover and load commands from the default commands directory
 */
export async function discoverCommandsFromDefault(): Promise<CommandRegistry> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Navigate from core/src to the parent tools directory
  const defaultPath = join(__dirname, '..', '..');
  return discoverCommands(defaultPath);
}

/**
 * Discover and load commands from a search path
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
 * Load a single command from a package directory
 */
async function loadCommand(commandPath: string): Promise<ICommand | null> {
  try {
    // Read and parse package.json
    const packageJsonPath = join(commandPath, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    // Get the main/module entry point from package.json
    const entryPoint = packageJson.module || packageJson.main;
    if (!entryPoint) {
      console.warn(
        `No main/module entry point found in package.json at ${commandPath}`,
      );
      return null;
    }

    // Prefer src in development or when explicitly requested via env flag
    const preferSrc =
      process.env.NODE_ENV !== 'production' ||
      process.env.MCP_FUNNEL_PREFER_SRC === '1';

    if (preferSrc) {
      const srcIndexPath = join(commandPath, 'src', 'index.ts');
      try {
        await fs.access(srcIndexPath);
        const module = await import(srcIndexPath);
        const command =
          module.default ||
          module.command ||
          findCommandInModule(module as unknown);

        if (isValidCommand(command)) {
          return command as ICommand;
        }
        // fall through to dist if src did not export a valid command
      } catch {
        // fall through to dist if src path not accessible
      }
    }

    // Try to import from the specified entry point
    const modulePath = join(commandPath, entryPoint);

    try {
      await fs.access(modulePath);
      const module = await import(modulePath);

      // Look for default export or named exports that implement ICommand
      const command =
        module.default || module.command || findCommandInModule(module);

      if (isValidCommand(command)) {
        return command as ICommand;
      }
    } catch (_importError) {
      // Try fallback to src/index.ts for development
      const srcIndexPath = join(commandPath, 'src', 'index.ts');
      try {
        await fs.access(srcIndexPath);
        const module = await import(srcIndexPath);
        const command =
          module.default || module.command || findCommandInModule(module);

        if (isValidCommand(command)) {
          return command as ICommand;
        }
      } catch (srcError) {
        console.warn(`Could not import command from ${commandPath}:`, srcError);
      }
    }
  } catch (error) {
    console.warn(`Invalid command package at ${commandPath}:`, error);
  }

  return null;
}

/**
 * Find a command implementation in a module's exports
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
 * Validate that an object implements the ICommand interface
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
