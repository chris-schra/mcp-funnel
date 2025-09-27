/**
 * Installation operations for command packages
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ICommand } from './interfaces.js';
import type { InstalledCommand, InstallOptions } from './installer-types.js';
import { PackageUtils } from './package-utils.js';
import { CommandLoader } from './command-loader.js';

const execAsync = promisify(exec);

/**
 * Context for installation operations
 */
export interface InstallContext {
  packagesDir: string;
  getPackagePath: (packageName: string) => string;
}

/**
 * Result of package installation
 */
export interface InstallResult {
  installedCommand: InstalledCommand;
  resolvedPackageName: string;
  command: ICommand;
  pkgJson: Record<string, unknown>;
}

/**
 * Core installation operations extracted from CommandInstaller
 */
export class InstallOperations {
  /**
   * Perform npm installation and return resolved package info
   */
  static async performInstallation(
    packageSpec: string,
    installSpec: string,
    dependencyGuess: string,
    options: InstallOptions,
    context: InstallContext,
    packagesJsonBefore: Record<string, unknown>,
    manifest: any,
  ): Promise<InstallResult> {
    console.info(`Installing command package: ${installSpec}`);

    // Install the package using npm
    const { stderr } = await execAsync(`npm install --save "${installSpec}"`, {
      cwd: context.packagesDir,
    });

    if (stderr && !stderr.includes('npm WARN')) {
      console.warn('Installation warnings:', stderr);
    }

    const packagesJsonAfter = await InstallOperations.readPackagesPackageJson(
      context.packagesDir,
    );
    const resolvedPackageName = PackageUtils.resolveInstalledPackageName({
      installSpec,
      packageSpec,
      dependencyGuess,
      manifest,
      packagesJsonBefore,
      packagesJsonAfter,
    });

    // Load the installed command to get metadata
    const commandPath = context.getPackagePath(resolvedPackageName);
    const command = await CommandLoader.loadCommand(commandPath);

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

    return {
      installedCommand,
      resolvedPackageName,
      command,
      pkgJson,
    };
  }

  /**
   * Uninstall a package and optionally remove its data
   */
  static async performUninstallation(
    packageName: string,
    commandName: string,
    packagesDir: string,
    baseDir: string,
    removeData: boolean = false,
  ): Promise<void> {
    console.info(`Uninstalling command: ${commandName} (${packageName})`);

    // Uninstall the package
    await execAsync(`npm uninstall "${packageName}"`, {
      cwd: packagesDir,
    });

    // Optionally remove command data
    if (removeData) {
      const dataDir = join(baseDir, 'data', commandName);
      try {
        await fs.rm(dataDir, { recursive: true, force: true });
      } catch {
        // Ignore if data directory doesn't exist
      }
    }

    console.info(`Successfully uninstalled command: ${commandName}`);
  }

  /**
   * Update a package to the latest version
   */
  static async performUpdate(
    packageName: string,
    commandName: string,
    packagesDir: string,
    getPackagePath: (name: string) => string,
  ): Promise<string> {
    console.info(`Updating command: ${commandName} (${packageName})`);

    // Update using npm
    await execAsync(`npm update "${packageName}"`, {
      cwd: packagesDir,
    });

    // Get new version
    const commandPath = getPackagePath(packageName);
    const pkgJsonPath = join(commandPath, 'package.json');
    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));

    console.info(
      `Successfully updated command: ${commandName} to version ${pkgJson.version}`,
    );

    return pkgJson.version;
  }

  /**
   * Read packages package.json file
   */
  private static async readPackagesPackageJson(
    packagesDir: string,
  ): Promise<Record<string, unknown>> {
    const packageJsonPath = join(packagesDir, 'package.json');
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
