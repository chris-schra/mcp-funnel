import type { ICommand } from '@mcp-funnel/commands-core';
import { join } from 'path';
import { promises as fs } from 'fs';

/**
 * Validate that an object implements ICommand interface
 */
function isValidCommand(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const cmd = obj as Record<string, unknown>;
  return (
    typeof cmd.name === 'string' &&
    typeof cmd.description === 'string' &&
    typeof cmd.executeToolViaMCP === 'function' &&
    typeof cmd.executeViaCLI === 'function' &&
    typeof cmd.getMCPDefinitions === 'function'
  );
}

/**
 * Load a command export from an installed package path
 */
export async function loadCommand(
  commandPath: string,
): Promise<ICommand | null> {
  try {
    const pkgJsonPath = join(commandPath, 'package.json');
    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));

    const entryPoint = pkgJson.module || pkgJson.main;
    if (!entryPoint) {
      return null;
    }

    const modulePath = join(commandPath, entryPoint);
    const module = await import(modulePath);

    // Look for default export or command export
    const command = module.default || module.command;

    if (isValidCommand(command)) {
      return command as ICommand;
    }

    // Search for any export that looks like a command
    for (const value of Object.values(module)) {
      if (isValidCommand(value)) {
        return value as ICommand;
      }
    }
  } catch (error) {
    console.warn(`Failed to load command from ${commandPath}:`, error);
  }

  return null;
}
