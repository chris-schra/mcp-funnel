import { discoverCommands, type ICommand } from '@mcp-funnel/commands-core';
import { Dirent } from 'fs';
import { join } from 'path';

export interface CommandDiscoveryPaths {
  /** Local development folder path (e.g., ./packages/commands) */
  local?: string;
  /** Bundled commands path (e.g., from source build) */
  bundled?: string;
  /** Node modules scope directory (e.g., ./node_modules/@mcp-funnel) */
  nodeModulesScope?: string;
}

export interface CommandDiscoveryOptions {
  /** Search paths for command discovery */
  paths: CommandDiscoveryPaths;
  /** Optional list of enabled commands (empty array = all enabled) */
  enabledCommands?: string[];
  /** Context for command retrieval ('mcp' or 'cli') */
  context: 'mcp' | 'cli';
  /** Callback function called for each discovered and enabled command */
  onCommandFound: (command: ICommand) => void;
}

/**
 * Shared command discovery logic that eliminates duplication between
 * index.ts (MCP registration) and run.ts (CLI registration).
 *
 * This function scans multiple paths for command packages and calls
 * the provided callback for each valid, enabled command found.
 */
export async function discoverCommandsFromPaths(
  options: CommandDiscoveryOptions,
): Promise<void> {
  const { paths, enabledCommands = [], context, onCommandFound } = options;

  // Helper function to validate command objects
  const isValidCommand = (obj: unknown): obj is ICommand => {
    if (!obj || typeof obj !== 'object') return false;
    const c = obj as Record<string, unknown>;
    return (
      typeof c.name === 'string' &&
      typeof c.description === 'string' &&
      typeof c.executeToolViaMCP === 'function' &&
      typeof c.executeViaCLI === 'function' &&
      typeof c.getMCPDefinitions === 'function'
    );
  };

  // Helper function to process commands from a registry
  const processRegistryCommands = async (
    registry: Awaited<ReturnType<typeof discoverCommands>>,
  ) => {
    for (const commandName of registry.getAllCommandNames()) {
      const command =
        context === 'mcp'
          ? registry.getCommandForMCP(commandName)
          : registry.getCommandForCLI(commandName);
      if (
        command &&
        (enabledCommands.length === 0 || enabledCommands.includes(command.name))
      ) {
        onCommandFound(command);
      }
    }
  };

  // 1) Local development folder (e.g., monorepo style)
  if (paths.local) {
    try {
      const { existsSync } = await import('fs');
      if (existsSync(paths.local)) {
        const localRegistry = await discoverCommands(paths.local);
        await processRegistryCommands(localRegistry);
      }
    } catch {
      // Ignore if not present or failed to load
    }
  }

  // 2) Bundled commands path (when running from source)
  if (paths.bundled) {
    try {
      const { existsSync } = await import('fs');
      if (existsSync(paths.bundled)) {
        const bundledRegistry = await discoverCommands(paths.bundled);
        await processRegistryCommands(bundledRegistry);
      }
    } catch {
      // Ignore if not present or failed to load
    }
  }

  // 3) Zero-config auto-scan for installed command packages under node_modules scope
  if (paths.nodeModulesScope) {
    try {
      const { readdirSync, existsSync } = await import('fs');
      if (existsSync(paths.nodeModulesScope)) {
        const entries = readdirSync(paths.nodeModulesScope, {
          withFileTypes: true,
        });
        const packageDirs = entries
          .filter(
            (e: Dirent) => e.isDirectory() && e.name.startsWith('command-'),
          )
          .map((e: Dirent) => join(paths.nodeModulesScope!, e.name));

        for (const pkgDir of packageDirs) {
          try {
            const pkgJsonPath = join(pkgDir, 'package.json');
            if (!existsSync(pkgJsonPath)) continue;

            const { readFile } = await import('fs/promises');
            const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf-8')) as {
              module?: string;
              main?: string;
            };
            const entry = pkg.module || pkg.main;
            if (!entry) continue;

            const mod = await import(join(pkgDir, entry));
            const modObj = mod as Record<string, unknown>;
            const candidate = modObj.default || modObj.command;
            const chosen = isValidCommand(candidate)
              ? candidate
              : (Object.values(modObj).find(isValidCommand) as
                  | ICommand
                  | undefined);

            if (
              chosen &&
              (enabledCommands.length === 0 ||
                enabledCommands.includes(chosen.name))
            ) {
              onCommandFound(chosen);
            }
          } catch {
            // Skip invalid package
            continue;
          }
        }
      }
    } catch {
      // Ignore if scope directory doesn't exist or is unreadable
    }
  }
}
