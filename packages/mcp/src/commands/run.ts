import { discoverCommands } from '@mcp-funnel/commands-core';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

export async function runCommand(name: string, args: string[]): Promise<void> {
  try {
    // Try multiple locations for commands
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // 1. Try local development path first
    const localCommandsPath = resolve(process.cwd(), 'packages/commands');
    let registry;

    if (existsSync(localCommandsPath)) {
      registry = await discoverCommands(localCommandsPath);
    }

    // 2. Try bundled commands
    const bundledPath = resolve(__dirname, '../../../commands');
    if (!registry && existsSync(bundledPath)) {
      registry = await discoverCommands(bundledPath);
    }

    // 3. Try node_modules scope
    const scopeDir = resolve(process.cwd(), 'node_modules', '@mcp-funnel');
    if (!registry && existsSync(scopeDir)) {
      // Look for command packages in the scope
      const { readdirSync } = await import('fs');
      const entries = readdirSync(scopeDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('command-')) {
          const cmdPath = resolve(scopeDir, entry.name);
          registry = await discoverCommands(cmdPath);
          if (registry) break;
        }
      }
    }

    if (!registry) {
      console.error('No commands found in any location');
      process.exit(1);
    }

    const command = registry.getCommandForCLI(name);
    if (!command) {
      console.error(`Command not found: ${name}`);
      console.error(
        `Available commands: ${registry.getAllCommandNames().join(', ')}`,
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
