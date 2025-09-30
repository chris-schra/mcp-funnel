import { discoverCommands, CommandRegistry } from '@mcp-funnel/commands-core';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

/**
 * Discovers and executes a command by name with provided arguments.
 *
 * Searches for commands in multiple locations with fallback precedence:
 * 1. Local development commands (packages/commands) - for monorepo development
 * 2. Bundled commands within this package - for distributed package
 * 3. Installed command packages (node_modules/\@mcp-funnel/command-*) - for extensions
 * @param name - Command name to execute (e.g., 'validate', 'debug')
 * @param args - Command-line arguments to pass to the command
 * @throws \{Error\} When no commands are found in any location
 * @throws \{Error\} When the specified command name is not found in the registry
 * @throws \{Error\} When command execution fails
 * @example
 * ```typescript
 * // Execute a validation command with fix flag
 * await runCommand('validate', ['--fix']);
 * ```
 * @public
 * @see {@link discoverCommands} - Command discovery implementation
 * @see {@link CommandRegistry} - Command registry
 */
export async function runCommand(name: string, args: string[]): Promise<void> {
  try {
    const aggregateRegistry = new CommandRegistry();
    let discoveredAny = false;

    const registerFromRegistry = (registry: CommandRegistry) => {
      let registered = false;
      for (const commandName of registry.getAllCommandNames()) {
        const command = registry.getCommandForCLI(commandName);
        if (command) {
          aggregateRegistry.register(command);
          registered = true;
        }
      }
      return registered;
    };

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // 1. Local development commands (packages/commands)
    const localCommandsPath = resolve(process.cwd(), 'packages/commands');
    if (existsSync(localCommandsPath)) {
      const registry = await discoverCommands(localCommandsPath);
      if (registerFromRegistry(registry)) {
        discoveredAny = true;
      }
    }

    // 2. Bundled commands within this package
    const bundledPath = resolve(__dirname, '../../../commands');
    if (existsSync(bundledPath)) {
      const registry = await discoverCommands(bundledPath);
      if (registerFromRegistry(registry)) {
        discoveredAny = true;
      }
    }

    // 3. Installed command packages under node_modules/@mcp-funnel
    const scopeDir = resolve(process.cwd(), 'node_modules', '@mcp-funnel');
    if (existsSync(scopeDir)) {
      const { readdirSync } = await import('fs');
      const entries = readdirSync(scopeDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('command-')) {
          continue;
        }

        const cmdPath = resolve(scopeDir, entry.name);
        if (!existsSync(cmdPath)) {
          continue;
        }

        const registry = await discoverCommands(cmdPath);
        if (registerFromRegistry(registry)) {
          discoveredAny = true;
        }
      }
    }

    if (!discoveredAny) {
      console.error('No commands found in any location');
      process.exit(1);
    }

    const command = aggregateRegistry.getCommandForCLI(name);
    if (!command) {
      console.error(`Command not found: ${name}`);
      console.error(
        `Available commands: ${aggregateRegistry
          .getAllCommandNames()
          .join(', ')}`,
      );
      process.exit(1);
    }

    // Execute command via CLI interface
    await command.executeViaCLI(args);
  } catch (error) {
    console.error('Failed to run command:', error);
    process.exit(1);
  }
}
