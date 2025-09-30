import { readManifest, type UninstallOptions } from '@mcp-funnel/commands-core';
import type { CommandInstallerContext } from '../types/index.js';
import { promisify } from 'util';
import { exec } from 'child_process';
import { writeManifest } from './writeManifest.js';
import { join } from 'path';
import * as fs from 'node:fs/promises';

const execAsync = promisify(exec);

/**
 * Uninstalls a command package from the isolated packages directory.
 *
 * This function orchestrates the complete uninstallation workflow:
 * 1. Loads the manifest and searches for the command by package name or command name
 * 2. Executes npm uninstall to remove the package from node_modules
 * 3. Removes the command entry from the manifest
 * 4. Optionally deletes associated data directory if removeData option is set
 *
 * The function supports flexible lookup - it can find commands by either their
 * npm package name (e.g., '\@mcp-funnel/commands-js-debugger') or their
 * registered command name (e.g., 'js-debugger').
 * @param context - Installer context containing directory paths and manifest location
 * @param packageNameOrCommandName - Either the npm package name or the registered command name to uninstall
 * @param options - Uninstall options controlling data cleanup behavior
 * @throws When the specified command is not found in the manifest
 * @throws When npm uninstall operation fails
 * @public
 * @see file:./writeManifest.ts - Manifest persistence after uninstall
 * @see file:./readManifest.ts - Manifest loading
 * @see file:../types/index.ts:19 - UninstallOptions definition
 * @see file:../types/index.ts:23 - CommandInstallerContext definition
 */
export async function uninstall(
  context: CommandInstallerContext,
  packageNameOrCommandName: string,
  options: UninstallOptions = {},
): Promise<void> {
  const manifest = await readManifest(context.manifestPath);

  // Find command by package name or command name
  const commandIndex = manifest.commands.findIndex(
    (cmd) =>
      cmd.package === packageNameOrCommandName ||
      cmd.name === packageNameOrCommandName,
  );

  if (commandIndex === -1) {
    throw new Error(`Command '${packageNameOrCommandName}' is not installed`);
  }

  const command = manifest.commands[commandIndex];
  console.info(`Uninstalling command: ${command.name} (${command.package})`);

  try {
    // Uninstall the package
    await execAsync(`npm uninstall "${command.package}"`, {
      cwd: context.packagesDir,
    });

    // Remove from manifest
    manifest.commands.splice(commandIndex, 1);
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(context.manifestPath, manifest);

    // Optionally remove command data
    if (options.removeData) {
      const dataDir = join(context.baseDir, 'data', command.name);
      try {
        await fs.rm(dataDir, { recursive: true, force: true });
      } catch {
        // Ignore if data directory doesn't exist
      }
    }

    console.info(`Successfully uninstalled command: ${command.name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to uninstall command: ${errorMessage}`);
  }
}
