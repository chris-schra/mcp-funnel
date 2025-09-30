import type { ICommand } from '@mcp-funnel/commands-core';
import { join } from 'path';
import { promises as fs } from 'fs';

/**
 * Validate that an object implements ICommand interface
 *
 * Performs runtime validation to ensure an object has all required properties
 * and methods defined by the ICommand interface.
 * @param obj - The object to validate
 * @returns True if the object implements all ICommand interface requirements
 * @internal
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
 *
 * Dynamically imports a command package and validates that it exports a valid
 * ICommand implementation. The function searches for the command in the following order:
 * 1. Default export (module.default)
 * 2. Named export called 'command' (module.command)
 * 3. Any export that passes ICommand validation
 *
 * The entry point is determined from the package.json's 'module' or 'main' field.
 * @param commandPath - Absolute path to the installed command package directory
 * @returns Promise resolving to the loaded ICommand instance, or null if loading fails
 * @example
 * ```typescript
 * const commandPath = '/path/to/packages/my-command';
 * const command = await loadCommand(commandPath);
 * if (command) {
 *   console.log(`Loaded: ${command.name}`);
 * }
 * ```
 * @public
 * @see file:../interfaces.ts:8 - ICommand interface definition
 * @see file:./getPackagePath.ts:20 - Used to resolve command paths
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
