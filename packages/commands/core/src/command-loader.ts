/**
 * Command loading and validation utilities
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import type { ICommand } from './interfaces.js';

/**
 * Handles loading and validation of command modules
 */
export class CommandLoader {
  /**
   * Validate that an object implements ICommand interface
   */
  static isValidCommand(obj: unknown): boolean {
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
  static async loadCommand(commandPath: string): Promise<ICommand | null> {
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

      if (CommandLoader.isValidCommand(command)) {
        return command as ICommand;
      }

      // Search for any export that looks like a command
      for (const value of Object.values(module)) {
        if (CommandLoader.isValidCommand(value)) {
          return value as ICommand;
        }
      }
    } catch (error) {
      console.warn(`Failed to load command from ${commandPath}:`, error);
    }

    return null;
  }
}
