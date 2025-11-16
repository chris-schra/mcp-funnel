import { promises as fs } from 'fs';
import { join } from 'path';
import type { CommandManifest } from '@mcp-funnel/commands-core';
import type { CommandInstallerContext } from '../types/index.js';

/**
 * Initializes the directory structure and default files for user-installed commands.
 *
 * Creates the necessary directories (baseDir, packagesDir, cacheDir) and initializes
 * default package.json and manifest.json files if they don't already exist. This
 * function is idempotent and safe to call multiple times.
 * @param context - Installation context containing directory paths and manifest location
 * @example
 * ```typescript
 * const context: CommandInstallerContext = {
 *   baseDir: '/path/to/.mcp-funnel',
 *   packagesDir: '/path/to/.mcp-funnel/packages',
 *   manifestPath: '/path/to/.mcp-funnel/manifest.json',
 *   cacheDir: '/path/to/.mcp-funnel/cache'
 * };
 * await initialize(context);
 * ```
 * @public
 * @see file:../types/index.ts:23 - CommandInstallerContext interface definition
 * @see file:./install.ts:33 - Primary usage in install workflow
 */
export async function initialize(context: CommandInstallerContext): Promise<void> {
  await fs.mkdir(context.baseDir, { recursive: true });
  await fs.mkdir(context.packagesDir, { recursive: true });
  await fs.mkdir(context.cacheDir, { recursive: true });

  // Initialize package.json if it doesn't exist
  const packageJsonPath = join(context.packagesDir, 'package.json');
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
    await fs.access(context.manifestPath);
  } catch {
    const manifest: CommandManifest = {
      commands: [],
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(context.manifestPath, JSON.stringify(manifest, null, 2));
  }
}
