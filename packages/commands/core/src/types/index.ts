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

export interface CommandInstallerContext {
  readonly baseDir: string;
  readonly packagesDir: string;
  readonly manifestPath: string;
  readonly cacheDir: string;
}
