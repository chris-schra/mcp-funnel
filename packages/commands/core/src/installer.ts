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

    // Check if already installed
    const manifest = await this.readManifest();
    const existing = this.findMatchingCommand(manifest, packageSpec);

    if (existing && !options.force) {
      throw new Error(
        `Command package '${existing.package}' is already installed. Use force option to reinstall.`,
      );
    }

    const packagesJsonBefore = await this.readPackagesPackageJson();
    const dependencyGuess =
      existing?.package || this.parsePackageName(packageSpec);

    // Determine the install spec
    const installSpec = options.version
      ? `${dependencyGuess}@${options.version}`
      : packageSpec;

    console.info(`Installing command package: ${installSpec}`);

    try {
      // Install the package using npm
      const { stderr } = await execAsync(
        `npm install --save "${installSpec}"`,
        { cwd: this.packagesDir },
      );

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn('Installation warnings:', stderr);
      }

      const packagesJsonAfter = await this.readPackagesPackageJson();
      const resolvedPackageName = this.resolveInstalledPackageName({
        installSpec,
        packageSpec,
        dependencyGuess,
        manifest,
        packagesJsonBefore,
        packagesJsonAfter,
      });

      // Load the installed command to get metadata
      const commandPath = this.getPackagePath(resolvedPackageName);
      const command = await this.loadCommand(commandPath);

      if (!command) {
        // Rollback installation
        await execAsync(`npm uninstall "${resolvedPackageName}"`, {
          cwd: this.packagesDir,
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
      await this.writeManifest(manifest);

      console.info(
        `Successfully installed command: ${command.name} (${resolvedPackageName}@${pkgJson.version})`,
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
      await execAsync(`npm uninstall "${command.package}"`, {
        cwd: this.packagesDir,
      });

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
      await execAsync(`npm update "${command.package}"`, {
        cwd: this.packagesDir,
      });

      // Get new version
      const commandPath = join(
        this.packagesDir,
        'node_modules',
        command.package,
      );
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
    return this.extractPackageNameFromSpec(packageSpec);
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

  /**
   * Load a command export from an installed package path
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
   * Public helper to load an installed command by package name
   */
  async loadInstalledCommand(packageName: string): Promise<ICommand | null> {
    const commandPath = this.getPackagePath(packageName);
    return this.loadCommand(commandPath);
  }

  private findMatchingCommand(
    manifest: CommandManifest,
    packageSpec: string,
  ): InstalledCommand | undefined {
    return manifest.commands.find((cmd) =>
      this.packageMatchesSpec(cmd.package, packageSpec),
    );
  }

  private packageMatchesSpec(
    installedPackage: string,
    packageSpec: string,
  ): boolean {
    // Direct match
    if (installedPackage === packageSpec) {
      return true;
    }

    // Extract the package name from the spec (removes version, git info, etc)
    const normalizedSpec = this.extractPackageNameFromSpec(packageSpec);
    if (installedPackage === normalizedSpec) {
      return true;
    }

    // For scoped packages, also check without the scope
    // This handles cases where user might install "@scope/package" as "scope/package"
    if (installedPackage.startsWith('@')) {
      // Remove @ prefix to get "scope/package"
      const withoutAt = installedPackage.slice(1);
      if (packageSpec === withoutAt || normalizedSpec === withoutAt) {
        return true;
      }

      // Special-case git URLs: scoped packages installed via git often arrive as
      // git+https://host/scope/package.git. Ensure we detect those installs.
      if (packageSpec.includes('://') || packageSpec.includes('git+')) {
        // Extract the path from the git URL
        const urlMatch = packageSpec.match(
          /(?:git\+)?https?:\/\/[^/]+\/(.+?)(?:\.git)?(?:#.*)?$/,
        );
        if (urlMatch) {
          const urlPath = urlMatch[1];
          const scopeSlashPair = withoutAt;
          // Only match if the URL path is EXACTLY the scope/package
          // This prevents false positives like "other/myorg/tool" matching "@myorg/tool"
          if (urlPath === scopeSlashPair) {
            return true;
          }
        }
      }
    }

    // No match
    return false;
  }

  private extractPackageNameFromSpec(packageSpec: string): string {
    // Scoped packages may include version using a second '@'
    if (packageSpec.startsWith('@')) {
      const firstSlash = packageSpec.indexOf('/');
      const versionSeparator = packageSpec.lastIndexOf('@');
      if (versionSeparator > firstSlash) {
        return packageSpec.substring(0, versionSeparator);
      }
      return packageSpec;
    }

    // Git URLs or file specs don't encode the package name; fall back to repo tail
    if (packageSpec.includes('://') || packageSpec.includes('git+')) {
      const parts = packageSpec.split('/');
      const last = parts[parts.length - 1];
      return last.replace(/\.git$/, '');
    }

    if (packageSpec.includes('@')) {
      const [name] = packageSpec.split('@');
      return name;
    }

    return packageSpec;
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

  private resolveInstalledPackageName({
    installSpec,
    packageSpec,
    dependencyGuess,
    manifest,
    packagesJsonBefore,
    packagesJsonAfter,
  }: {
    installSpec: string;
    packageSpec: string;
    dependencyGuess: string;
    manifest: CommandManifest;
    packagesJsonBefore: Record<string, unknown>;
    packagesJsonAfter: Record<string, unknown>;
  }): string {
    const beforeDeps = this.getDependencyNames(packagesJsonBefore);
    const afterDeps = this.getDependencyEntries(packagesJsonAfter);
    const existing = this.findMatchingCommand(manifest, packageSpec);

    if (existing) {
      return existing.package;
    }

    const beforeSet = new Set(beforeDeps);
    const newDeps = afterDeps.filter(([name]) => !beforeSet.has(name));

    if (newDeps.length === 1) {
      return newDeps[0][0];
    }

    const guessEntry = afterDeps.find(([name]) => name === dependencyGuess);
    if (guessEntry) {
      return guessEntry[0];
    }

    const specMatch = afterDeps.find(([name, value]) => {
      if (value === packageSpec || value === installSpec) {
        return true;
      }
      if (typeof value === 'string') {
        // Git installs record the git reference in the value; ensure the package name is present
        if (
          (packageSpec.includes('://') || packageSpec.includes('git+')) &&
          value.includes(name)
        ) {
          return true;
        }
      }
      return false;
    });

    if (specMatch) {
      return specMatch[0];
    }

    return dependencyGuess;
  }

  private getDependencyNames(pkgJson: Record<string, unknown>): string[] {
    const deps = this.getDependencyEntries(pkgJson);
    return deps.map(([name]) => name);
  }

  private getDependencyEntries(
    pkgJson: Record<string, unknown>,
  ): [string, string][] {
    const deps = pkgJson.dependencies as Record<string, string> | undefined;
    if (!deps) {
      return [];
    }
    return Object.entries(deps);
  }
}
