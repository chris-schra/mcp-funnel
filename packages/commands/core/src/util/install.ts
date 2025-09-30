import type {
  CommandInstallerContext,
  InstalledCommand,
  InstallOptions,
} from '../types/index.js';
import { initialize } from './initialize.js';
import { readManifest } from '@mcp-funnel/commands-core';
import { findMatchingCommand } from './findMatchingCommand.js';
import { readPackagesPackageJson } from './readPackagesPackageJson.js';
import { extractPackageNameFromSpec } from './extractPackageNameFromSpec.js';
import { resolveInstalledPackageName } from './resolveInstalledPackageName.js';
import { getPackagePath } from './getPackagePath.js';
import { loadCommand } from './loadCommand.js';
import { join } from 'path';
import { promises as fs } from 'fs';
import { writeManifest } from './writeManifest.js';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export async function install(
  context: CommandInstallerContext,
  packageSpec: string,
  options: InstallOptions = {},
): Promise<InstalledCommand> {
  await initialize(context);

  // Check if already installed
  const manifest = await readManifest(context.manifestPath);
  const existing = findMatchingCommand(manifest, packageSpec);

  if (existing && !options.force) {
    throw new Error(
      `Command package '${existing.package}' is already installed. Use force option to reinstall.`,
    );
  }

  const packagesJsonBefore = await readPackagesPackageJson(context.packagesDir);
  const dependencyGuess =
    existing?.package || extractPackageNameFromSpec(packageSpec);

  // Determine the install spec
  const installSpec = options.version
    ? `${dependencyGuess}@${options.version}`
    : packageSpec;

  console.info(`Installing command package: ${installSpec}`);

  try {
    // Install the package using npm
    const { stderr } = await execAsync(`npm install --save "${installSpec}"`, {
      cwd: context.packagesDir,
    });

    if (stderr && !stderr.includes('npm WARN')) {
      console.warn('Installation warnings:', stderr);
    }

    const packagesJsonAfter = await readPackagesPackageJson(
      context.packagesDir,
    );
    const resolvedPackageName = resolveInstalledPackageName({
      installSpec,
      packageSpec,
      dependencyGuess,
      manifest,
      packagesJsonBefore,
      packagesJsonAfter,
    });

    // Load the installed command to get metadata
    const commandPath = getPackagePath(
      context.packagesDir,
      resolvedPackageName,
    );
    const command = await loadCommand(commandPath);

    if (!command) {
      // Rollback installation
      await execAsync(`npm uninstall "${resolvedPackageName}"`, {
        cwd: context.packagesDir,
      });
      throw new Error(
        `Package '${resolvedPackageName}' does not export a valid MCP Funnel command`,
      );
    }

    // Get package version
    const pkgJsonPath = join(commandPath, 'package.json');
    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));

    // Create installed command record
    const installedCommand: InstalledCommand = {
      name: command.name,
      package: resolvedPackageName,
      version: pkgJson.version,
      description: command.description,
      installedAt: new Date().toISOString(),
    };

    // Update manifest
    if (existing) {
      const index = manifest.commands.findIndex(
        (cmd) => cmd.package === existing.package,
      );
      manifest.commands[index] = installedCommand;
    } else {
      manifest.commands.push(installedCommand);
    }
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(context.manifestPath, manifest);

    console.info(
      `Successfully installed command: ${command.name} (${resolvedPackageName}@${pkgJson.version})`,
    );
    return installedCommand;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to install command package: ${errorMessage}`);
  }
}
