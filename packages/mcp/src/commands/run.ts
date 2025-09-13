import { discoverCommands } from '@mcp-funnel/commands-core';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runCommand(name: string, args: string[]): Promise<void> {
  try {
    // Discover commands from packages/commands directory
    const commandsPath = resolve(__dirname, '../../../commands');
    const registry = await discoverCommands(commandsPath);

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
