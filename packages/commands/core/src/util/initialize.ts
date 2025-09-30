import { promises as fs } from 'fs';
import { join } from 'path';
import type { CommandManifest } from '@mcp-funnel/commands-core';
import type { CommandInstallerContext } from '../types/index.js';

/**
 * Initialize the directory structure for user-installed commands
 */
export async function initialize(context: CommandInstallerContext) {
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
