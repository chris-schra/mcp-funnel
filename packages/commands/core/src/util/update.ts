import { type InstalledCommand, readManifest } from '@mcp-funnel/commands-core';
import type { CommandInstallerContext } from '../types/index.js';
import { promisify } from 'util';
import { exec } from 'child_process';
import { join } from 'path';
import * as fs from 'node:fs/promises';
import { writeManifest } from './writeManifest.js';

const execAsync = promisify(exec);

/**
 * Update a command to the latest version
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
