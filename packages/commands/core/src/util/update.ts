import { type InstalledCommand, readManifest } from '@mcp-funnel/commands-core';
import type { CommandInstallerContext } from '../types/index.js';
import { promisify } from 'util';
import { exec } from 'child_process';
import { join } from 'path';
import * as fs from 'node:fs/promises';
import { writeManifest } from './writeManifest.js';

const execAsync = promisify(exec);

/**
 * Updates an installed command package to its latest version.
 *
 * This function performs the following steps:
 * 1. Verifies the command exists in the manifest
 * 2. Executes npm update to upgrade the package
 * 3. Reads the new version from the updated package.json
 * 4. Updates the manifest with the new version and timestamp
 *
 * The command can be identified by either its package name (e.g., '@mcp-funnel/commands-js-debugger')
 * or its command name (e.g., 'js-debugger').
 * @param {CommandInstallerContext} context - Installer context containing directory paths and manifest location
 * @param {string} packageNameOrCommandName - Package name or command name to update
 * @returns {Promise<InstalledCommand>} Updated command metadata with new version number
 * @throws {Error} When the specified command is not found in the manifest
 * @throws {Error} When npm update fails (network error, package not found, invalid state)
 * @throws {Error} When the updated package.json cannot be read
 * @example
 * ```typescript
 * // Update by package name
 * const updated = await update(context, '@mcp-funnel/commands-js-debugger');
 * console.log(`Updated to version ${updated.version}`);
 *
 * // Update by command name
 * const updated = await update(context, 'js-debugger');
 * ```
 * @see file:./install.ts:65 - Related installation function
 * @see file:../installer.ts:154 - Public API wrapper
 * @internal
 */
export async function update(
  context: CommandInstallerContext,
  packageNameOrCommandName: string,
): Promise<InstalledCommand> {
  const manifest = await readManifest(context.manifestPath);
  const command = manifest.commands.find(
    (cmd) =>
      cmd.package === packageNameOrCommandName ||
      cmd.name === packageNameOrCommandName,
  );

  if (!command) {
    throw new Error(`Command '${packageNameOrCommandName}' is not installed`);
  }

  console.info(`Updating command: ${command.name} (${command.package})`);

  try {
    // Update using npm
    await execAsync(`npm update "${command.package}"`, {
      cwd: context.packagesDir,
    });

    // Get new version
    const commandPath = join(
      context.packagesDir,
      'node_modules',
      command.package,
    );
    const pkgJsonPath = join(commandPath, 'package.json');
    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));

    // Update manifest
    command.version = pkgJson.version;
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(context.manifestPath, manifest);

    console.info(
      `Successfully updated command: ${command.name} to version ${pkgJson.version}`,
    );
    return command;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to update command: ${errorMessage}`);
  }
}
