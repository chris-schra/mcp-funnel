import { readManifest, type UninstallOptions } from '@mcp-funnel/commands-core';
import type { CommandInstallerContext } from '../types/index.js';
import { promisify } from 'util';
import { exec } from 'child_process';
import { writeManifest } from './writeManifest.js';
import { join } from 'path';
import * as fs from 'node:fs/promises';

const execAsync = promisify(exec);

/**
 * Uninstall a command package
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
