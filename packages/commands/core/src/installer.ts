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

const execAsync = promisify(exec);

export interface InstalledCommand {
  name: string;
  package: string;
  version: string;
  installedAt: string;
  description?: string;
}

export interface CommandManifest {
  commands: InstalledCommand[];
  updatedAt: string;
}

export interface InstallOptions {
  force?: boolean; // Force reinstall even if already installed
  version?: string; // Specific version to install
}

export interface UninstallOptions {
  removeData?: boolean; // Also remove any data associated with the command
}

export class CommandInstaller {
  private readonly baseDir: string;
  private readonly packagesDir: string;
  private readonly manifestPath: string;
  private readonly cacheDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || join(homedir(), '.mcp-funnel');
    this.packagesDir = join(this.baseDir, 'packages');
    this.manifestPath = join(this.baseDir, 'commands-manifest.json');
    this.cacheDir = join(this.baseDir, 'cache');
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

    // Initialize manifest if it doesn't exist
    try {
      await fs.access(this.manifestPath);
    } catch {
      const manifest: CommandManifest = {
        commands: [],
        updatedAt: new Date().toISOString(),
      };
      await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
    }
  }

  /**
   * Install a command package from npm
   */
  async install(
    packageSpec: string,
    options: InstallOptions = {},
  ): Promise<InstalledCommand> {
    await this.initialize();

    // Parse package spec (could be name, name@version, git url, etc.)
    const packageName = this.parsePackageName(packageSpec);

    // Check if already installed
    const manifest = await this.readManifest();
    const existing = manifest.commands.find(
      (cmd) => cmd.package === packageName,
    );

    if (existing && !options.force) {
      throw new Error(
        `Command package '${packageName}' is already installed. Use force option to reinstall.`,
      );
    }

    // Determine the install spec
    const installSpec = options.version
      ? `${packageName}@${options.version}`
      : packageSpec;

    console.info(`Installing command package: ${installSpec}`);

    try {
      // Install the package using npm
      const { stdout, stderr } = await execAsync(
        `npm install --save "${installSpec}"`,
        { cwd: this.packagesDir },
      );

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn('Installation warnings:', stderr);
      }

      // Load the installed command to get metadata
      const commandPath = join(this.packagesDir, 'node_modules', packageName);
      const command = await this.loadCommand(commandPath);

      if (!command) {
        // Rollback installation
        await execAsync(
          `npm uninstall "${packageName}"`,
          { cwd: this.packagesDir },
        );
        throw new Error(
          `Package '${packageName}' does not export a valid MCP Funnel command`,
        );
      }

      // Get package version
      const pkgJsonPath = join(commandPath, 'package.json');
      const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));

      // Create installed command record
      const installedCommand: InstalledCommand = {
        name: command.name,
        package: packageName,
        version: pkgJson.version,
        description: command.description,
        installedAt: new Date().toISOString(),
      };

      // Update manifest
      if (existing) {
        const index = manifest.commands.findIndex(
          (cmd) => cmd.package === packageName,
        );
        manifest.commands[index] = installedCommand;
      } else {
        manifest.commands.push(installedCommand);
      }
      manifest.updatedAt = new Date().toISOString();
      await this.writeManifest(manifest);

      console.info(
        `Successfully installed command: ${command.name} (${packageName}@${pkgJson.version})`,
      );
      return installedCommand;
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
    const manifest = await this.readManifest();

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
      await execAsync(
        `npm uninstall "${command.package}"`,
        { cwd: this.packagesDir },
      );

      // Remove from manifest
      manifest.commands.splice(commandIndex, 1);
      manifest.updatedAt = new Date().toISOString();
      await this.writeManifest(manifest);

      // Optionally remove command data
      if (options.removeData) {
        const dataDir = join(this.baseDir, 'data', command.name);
        try {
          await fs.rm(dataDir, { recursive: true, force: true });
        } catch {
          // Ignore if data directory doesn't exist
        }
      }

      console.info(`Successfully uninstalled command: ${command.name}`);
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
    const manifest = await this.readManifest();
    return manifest.commands;
  }

  /**
   * Update a command to the latest version
   */
  async update(packageNameOrCommandName: string): Promise<InstalledCommand> {
    const manifest = await this.readManifest();
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
      await execAsync(
        `npm update "${command.package}"`,
        { cwd: this.packagesDir },
      );

      // Get new version
      const commandPath = join(this.packagesDir, 'node_modules', command.package);
      const pkgJsonPath = join(commandPath, 'package.json');
      const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));

      // Update manifest
      command.version = pkgJson.version;
      manifest.updatedAt = new Date().toISOString();
      await this.writeManifest(manifest);

      console.info(
        `Successfully updated command: ${command.name} to version ${pkgJson.version}`,
      );
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
    const manifest = await this.readManifest();
    return manifest.commands.some(
      (cmd) =>
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
   * Load a command from a package directory
   */
  private async loadCommand(commandPath: string): Promise<ICommand | null> {
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

      if (this.isValidCommand(command)) {
        return command as ICommand;
      }

      // Search for any export that looks like a command
      for (const value of Object.values(module)) {
        if (this.isValidCommand(value)) {
          return value as ICommand;
        }
      }
    } catch (error) {
      console.warn(`Failed to load command from ${commandPath}:`, error);
    }

    return null;
  }

  /**
   * Validate that an object implements ICommand interface
   */
  private isValidCommand(obj: unknown): boolean {
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
   * Parse package name from various package specs
   */
  private parsePackageName(packageSpec: string): string {
    // Handle scoped packages
    if (packageSpec.startsWith('@')) {
      const match = packageSpec.match(/^(@[^/@]+\/[^/@]+)/);
      return match ? match[1] : packageSpec.split('@')[1] || packageSpec;
    }

    // Handle git URLs
    if (packageSpec.includes('://') || packageSpec.includes('git+')) {
      const parts = packageSpec.split('/');
      const last = parts[parts.length - 1];
      return last.replace('.git', '');
    }

    // Handle name@version
    return packageSpec.split('@')[0];
  }

  /**
   * Read the command manifest
   */
  async readManifest(): Promise<CommandManifest> {
    try {
      const content = await fs.readFile(this.manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {
        commands: [],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Write the command manifest
   */
  private async writeManifest(manifest: CommandManifest): Promise<void> {
    await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
  }
}
