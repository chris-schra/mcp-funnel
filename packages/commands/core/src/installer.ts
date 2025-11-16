/**
 * Command installation and management system for MCP Funnel.
 *
 * Manages the lifecycle of command packages, including installation, updates, and removal.
 * Commands are installed to a dedicated directory structure in the user's home directory,
 * isolated from the main application to allow dynamic loading and unloading.
 *
 * Directory structure:
 * - `~/.mcp-funnel/packages/` - npm packages and node_modules
 * - `~/.mcp-funnel/commands-manifest.json` - tracking installed commands
 * - `~/.mcp-funnel/cache/` - command cache data
 * @example
 * ```typescript
 * import { CommandInstaller } from '@mcp-funnel/commands-core';
 *
 * const installer = new CommandInstaller();
 * const installed = await installer.install('@mcp-funnel/commands-js-debugger');
 * console.log(`Installed ${installed.name} v${installed.version}`);
 * ```
 * @public
 * @see file:./types/index.ts - Type definitions for installer context and options
 * @see file:./util/install.ts - Installation implementation
 */
import { homedir } from 'os';
import { join } from 'path';
import type { ICommand } from './interfaces.js';
import type {
  CommandInstallerContext,
  InstalledCommand,
  InstallOptions,
  UninstallOptions,
  CommandManifest,
} from './types/index.js';
import {
  getPackagePath,
  install,
  loadCommand,
  uninstall,
  update,
  readManifest,
  findMatchingCommand,
} from './util/index.js';

export interface ICommandInstaller {
  install(packageSpec: string, options?: InstallOptions): Promise<InstalledCommand>;
  uninstall(commandName: string, options?: UninstallOptions): Promise<void>;
  update(commandName: string): Promise<InstalledCommand>;
  isInstalled(packageNameOrCommandName: string): Promise<boolean>;
  getCommandsPath(): string;
  loadInstalledCommand(packageName: string): Promise<ICommand | null>;
  getManifestPath(): string;
}

export class CommandInstaller implements ICommandInstaller {
  private readonly context: CommandInstallerContext;

  /**
   * Creates a new command installer with the specified base directory.
   * @param customBaseDir - Optional custom base directory for command storage. Defaults to ~/.mcp-funnel
   */
  public constructor(customBaseDir?: string) {
    const baseDir = customBaseDir || join(homedir(), '.mcp-funnel');
    this.context = {
      baseDir,
      packagesDir: join(baseDir, 'packages'),
      manifestPath: join(baseDir, 'commands-manifest.json'),
      cacheDir: join(baseDir, 'cache'),
    };
  }

  /**
   * Installs a command package from npm registry.
   *
   * Downloads and installs the specified package to the isolated packages directory.
   * Validates the package exports implement the ICommand interface before completing installation.
   * Updates the manifest to track the newly installed command.
   * @param packageSpec - npm package specifier (e.g., 'package-name', '\@scope/package', 'package\@1.0.0')
   * @param options - Installation options controlling force reinstall and version pinning
   * @returns Metadata about the installed command including name, version, and installation timestamp
   * @throws When package is already installed and force option is not set
   * @throws When npm installation fails or package is not found
   * @throws When installed package does not export a valid ICommand
   * @example
   * ```typescript
   * // Install latest version
   * const cmd = await installer.install('\@mcp-funnel/commands-js-debugger');
   *
   * // Install specific version
   * const cmd = await installer.install('weather-tool', \{ version: '2.1.0' \});
   *
   * // Force reinstall
   * const cmd = await installer.install('weather-tool', \{ force: true \});
   * ```
   * @see file:./util/install.ts - Implementation details
   */
  public async install(
    packageSpec: string,
    options: InstallOptions = {},
  ): Promise<InstalledCommand> {
    return install(this.context, packageSpec, options);
  }

  /**
   * Uninstalls a command package and removes it from the manifest.
   *
   * Removes the npm package from the packages directory and updates the manifest.
   * Optionally removes associated command data from the cache directory.
   * @param packageNameOrCommandName - Package name (e.g., '\@org/package') or command name to uninstall
   * @param options - Uninstall options controlling whether to remove associated data
   * @returns Promise that resolves when uninstall is complete
   * @throws When the specified command is not found in the manifest
   * @throws When npm uninstall operation fails
   * @example
   * ```typescript
   * // Uninstall by package name
   * await installer.uninstall('\@mcp-funnel/commands-js-debugger');
   *
   * // Uninstall by command name
   * await installer.uninstall('js-debugger');
   *
   * // Also remove command data
   * await installer.uninstall('weather-tool', \{ removeData: true \});
   * ```
   * @see file:./util/uninstall.ts - Implementation details
   */
  public async uninstall(
    packageNameOrCommandName: string,
    options: UninstallOptions = {},
  ): Promise<void> {
    return uninstall(this.context, packageNameOrCommandName, options);
  }

  /**
   * Updates an installed command package to its latest version.
   *
   * Uses npm to update the package to the latest version available in the registry.
   * Updates the manifest with the new version number after successful update.
   * @param packageNameOrCommandName - Package name (e.g., '\@org/package') or command name to update
   * @returns Updated command metadata with new version information
   * @throws When the specified command is not found in the manifest
   * @throws When npm update operation fails
   * @example
   * ```typescript
   * // Update by package name
   * const updated = await installer.update('\@mcp-funnel/commands-js-debugger');
   * console.log(`Updated to version ${updated.version}`);
   *
   * // Update by command name
   * const updated = await installer.update('js-debugger');
   * ```
   * @see file:./util/update.ts - Implementation details
   */
  public async update(packageNameOrCommandName: string): Promise<InstalledCommand> {
    return update(this.context, packageNameOrCommandName);
  }

  /**
   * Returns the absolute path to the commands manifest JSON file.
   *
   * The manifest file tracks all installed commands with their metadata including
   * package name, version, installation date, and description.
   * @returns Absolute path to commands-manifest.json
   * @example
   * ```typescript
   * const manifestPath = installer.getManifestPath();
   * console.log(`Manifest at: ${manifestPath}`);
   * // Output: Manifest at: /Users/username/.mcp-funnel/commands-manifest.json
   * ```
   */
  public getManifestPath(): string {
    return this.context.manifestPath;
  }

  /**
   * Checks if a command is installed by package name or command name.
   *
   * Searches the manifest to determine if the specified command is installed.
   * @param packageNameOrCommandName - Package name (e.g., '\@org/package') or command name to check
   * @returns True if the command is installed, false otherwise
   * @example
   * ```typescript
   * const installed = await installer.isInstalled('@mcp-funnel/commands-js-debugger');
   * if (installed) {
   *   console.log('Command is already installed');
   * }
   * ```
   */
  public async isInstalled(packageNameOrCommandName: string): Promise<boolean> {
    const manifest = await this.readManifest();
    const matchByPackage = findMatchingCommand(manifest, packageNameOrCommandName);
    if (matchByPackage) {
      return true;
    }
    // Also check by command name
    return manifest.commands.some((cmd) => cmd.name === packageNameOrCommandName);
  }

  /**
   * Returns the path to the installed commands directory (node_modules).
   *
   * This is where command packages are installed after running install().
   * @returns Absolute path to the node_modules directory containing installed commands
   * @example
   * ```typescript
   * const commandsPath = installer.getCommandsPath();
   * console.log(`Commands installed at: ${commandsPath}`);
   * // Output: Commands installed at: /Users/username/.mcp-funnel/packages/node_modules
   * ```
   */
  public getCommandsPath(): string {
    return join(this.context.packagesDir, 'node_modules');
  }

  /**
   * Loads and returns an installed command instance by package name.
   *
   * Attempts to dynamically import the command package and extract an object
   * implementing the ICommand interface. Searches the default export first,
   * then other named exports if necessary.
   * @param packageName - Package name (e.g., '\@org/package' or 'package-name')
   * @returns Command instance if found and valid, null if package doesn't export a valid command
   * @example
   * ```typescript
   * const command = await installer.loadInstalledCommand('\@mcp-funnel/commands-js-debugger');
   * if (command) {
   *   const tools = command.getMCPDefinitions();
   *   console.log(`Loaded ${tools.length} tools from ${command.name}`);
   * }
   * ```
   * @see file:./util/loadCommand.ts - Command loading and validation logic
   * @see file:./interfaces.ts:8 - ICommand interface definition
   */
  public async loadInstalledCommand(packageName: string): Promise<ICommand | null> {
    const commandPath = getPackagePath(this.context.packagesDir, packageName);
    return loadCommand(commandPath);
  }

  /**
   * Reads the command manifest containing all installed commands.
   *
   * Returns an empty manifest if the file doesn't exist yet.
   * @returns The command manifest with list of installed commands
   * @internal
   */
  private async readManifest(): Promise<CommandManifest> {
    return readManifest(this.context.manifestPath);
  }
}
