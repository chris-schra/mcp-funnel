/**
 * Command installation and management system for MCP Funnel
 * Allows dynamic installation of command packages to user home directory
 */
import { homedir } from 'os';
import { join } from 'path';
import type { ICommand } from './interfaces.js';
import type {
  CommandInstallerContext,
  InstalledCommand,
  InstallOptions,
  UninstallOptions,
} from './types/index.js';
import {
  getPackagePath,
  install,
  loadCommand,
  uninstall,
  update,
} from './util/index.js';

export class CommandInstaller {
  private readonly context: CommandInstallerContext;

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
   * Install a command package from npm
   */
  public async install(
    packageSpec: string,
    options: InstallOptions = {},
  ): Promise<InstalledCommand> {
    return install(this.context, packageSpec, options);
  }

  /**
   * Uninstall a command package
   */
  public async uninstall(
    packageNameOrCommandName: string,
    options: UninstallOptions = {},
  ): Promise<void> {
    return uninstall(this.context, packageNameOrCommandName, options);
  }

  /**
   * Update a command to the latest version
   */
  public async update(
    packageNameOrCommandName: string,
  ): Promise<InstalledCommand> {
    return update(this.context, packageNameOrCommandName);
  }

  /**
   * Get the path to the manifest file
   */
  public getManifestPath(): string {
    return this.context.manifestPath;
  }

  /**
   * Public helper to load an installed command by package name
   */
  public async loadInstalledCommand(
    packageName: string,
  ): Promise<ICommand | null> {
    const commandPath = getPackagePath(this.context.packagesDir, packageName);
    return loadCommand(commandPath);
  }
}
