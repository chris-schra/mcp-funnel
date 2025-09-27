/**
 * Command installation and management system for MCP Funnel
 * Allows dynamic installation of command packages to user home directory
 */

import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ICommand } from './interfaces.js';
import type {
  InstalledCommand,
  CommandManifest,
  InstallOptions,
  UninstallOptions,
} from './installer-types.js';
import { PackageUtils } from './package-utils.js';
import { ManifestManager } from './manifest-manager.js';
import { CommandLoader } from './command-loader.js';
import {
  InstallOperations,
  type InstallContext,
} from './install-operations.js';

const execAsync = promisify(exec);

// Re-export types for backward compatibility
export type {
  InstalledCommand,
  CommandManifest,
  InstallOptions,
  UninstallOptions,
} from './installer-types.js';

export class CommandInstaller {
  private readonly baseDir: string;
  private readonly packagesDir: string;
  private readonly cacheDir: string;
  private readonly manifestManager: ManifestManager;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || join(homedir(), '.mcp-funnel');
    this.packagesDir = join(this.baseDir, 'packages');
    this.cacheDir = join(this.baseDir, 'cache');
    this.manifestManager = new ManifestManager(
      join(this.baseDir, 'commands-manifest.json'),
    );
  }

  /**
   * Initialize the directory structure for user-installed commands
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.mkdir(this.packagesDir, { recursive: true });
    await fs.mkdir(this.cacheDir, { recursive: true });

    // Initialize package.json if it doesn't exist
    const packageJsonPath = join(this.packagesDir, 'package.json');
    try {
      await fs.access(packageJsonPath);
    } catch {
      const packageJson = {
        name: '@mcp-funnel/user-commands',
        version: '1.0.0',
        private: true,
        description: 'User-installed MCP Funnel commands',
        type: 'module',
      };
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    // Manifest initialization is handled by ManifestManager
    await this.manifestManager.read();
  }

  /**
   * Install a command package from npm
   */
  async install(
    packageSpec: string,
    options: InstallOptions = {},
  ): Promise<InstalledCommand> {
    await this.initialize();

    // Check if already installed
    const manifest = await this.manifestManager.read();
    const existing = PackageUtils.findMatchingCommand(manifest, packageSpec);

    if (existing && !options.force) {
      throw new Error(
        `Command package '${existing.package}' is already installed. Use force option to reinstall.`,
      );
    }

    const packagesJsonBefore = await this.readPackagesPackageJson();
    const dependencyGuess =
      existing?.package || PackageUtils.parsePackageName(packageSpec);

    // Determine the install spec
    const installSpec = options.version
      ? `${dependencyGuess}@${options.version}`
      : packageSpec;

    try {
      const context: InstallContext = {
        packagesDir: this.packagesDir,
        getPackagePath: (name) => this.getPackagePath(name),
      };

      const result = await InstallOperations.performInstallation(
        packageSpec,
        installSpec,
        dependencyGuess,
        options,
        context,
        packagesJsonBefore,
        manifest,
      );

      // Update manifest
      if (existing) {
        const index = manifest.commands.findIndex(
          (cmd: InstalledCommand) => cmd.package === existing.package,
        );
        manifest.commands[index] = result.installedCommand;
      } else {
        manifest.commands.push(result.installedCommand);
      }
      const updatedManifest = this.manifestManager.updateTimestamp(manifest);
      await this.manifestManager.write(updatedManifest);

      console.info(
        `Successfully installed command: ${result.command.name} (${result.resolvedPackageName}@${result.pkgJson.version})`,
      );
      return result.installedCommand;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to install command package: ${errorMessage}`);
    }
  }

  /**
   * Uninstall a command package
   */
  async uninstall(
    packageNameOrCommandName: string,
    options: UninstallOptions = {},
  ): Promise<void> {
    const manifest = await this.manifestManager.read();

    // Find command by package name or command name
    const commandIndex = manifest.commands.findIndex(
      (cmd: InstalledCommand) =>
        cmd.package === packageNameOrCommandName ||
        cmd.name === packageNameOrCommandName,
    );

    if (commandIndex === -1) {
      throw new Error(`Command '${packageNameOrCommandName}' is not installed`);
    }

    const command = manifest.commands[commandIndex];

    try {
      await InstallOperations.performUninstallation(
        command.package,
        command.name,
        this.packagesDir,
        this.baseDir,
        options.removeData,
      );

      // Remove from manifest
      manifest.commands.splice(commandIndex, 1);
      const updatedManifest = this.manifestManager.updateTimestamp(manifest);
      await this.manifestManager.write(updatedManifest);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to uninstall command: ${errorMessage}`);
    }
  }

  /**
   * List all installed commands
   */
  async list(): Promise<InstalledCommand[]> {
    const manifest = await this.manifestManager.read();
    return manifest.commands;
  }

  /**
   * Update a command to the latest version
   */
  async update(packageNameOrCommandName: string): Promise<InstalledCommand> {
    const manifest = await this.manifestManager.read();
    const command = manifest.commands.find(
      (cmd: InstalledCommand) =>
        cmd.package === packageNameOrCommandName ||
        cmd.name === packageNameOrCommandName,
    );

    if (!command) {
      throw new Error(`Command '${packageNameOrCommandName}' is not installed`);
    }

    try {
      const newVersion = await InstallOperations.performUpdate(
        command.package,
        command.name,
        this.packagesDir,
        (name) => this.getPackagePath(name),
      );

      // Update manifest
      command.version = newVersion;
      const updatedManifest = this.manifestManager.updateTimestamp(manifest);
      await this.manifestManager.write(updatedManifest);

      return command;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update command: ${errorMessage}`);
    }
  }

  /**
   * Check if a command is installed
   */
  async isInstalled(packageNameOrCommandName: string): Promise<boolean> {
    const manifest = await this.manifestManager.read();
    return manifest.commands.some(
      (cmd: InstalledCommand) =>
        cmd.package === packageNameOrCommandName ||
        cmd.name === packageNameOrCommandName,
    );
  }

  /**
   * Get the path to installed commands directory
   */
  getCommandsPath(): string {
    return join(this.packagesDir, 'node_modules');
  }

  /**
   * Read the command manifest
   * @deprecated Use list() method instead or access manifestManager directly
   */
  async readManifest(): Promise<CommandManifest> {
    return this.manifestManager.read();
  }

  /**
   * Public helper to load an installed command by package name
   */
  async loadInstalledCommand(packageName: string): Promise<ICommand | null> {
    const commandPath = this.getPackagePath(packageName);
    return CommandLoader.loadCommand(commandPath);
  }

  /**
   * Find a command in the manifest that matches the given package spec
   * @deprecated Use PackageUtils.findMatchingCommand instead
   */
  protected findMatchingCommand(
    manifest: CommandManifest,
    packageSpec: string,
  ): InstalledCommand | undefined {
    return PackageUtils.findMatchingCommand(manifest, packageSpec);
  }

  private getPackagePath(packageName: string): string {
    return join(this.packagesDir, 'node_modules', packageName);
  }

  private async readPackagesPackageJson(): Promise<Record<string, unknown>> {
    const packageJsonPath = join(this.packagesDir, 'package.json');
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
