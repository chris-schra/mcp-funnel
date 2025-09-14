import { discoverCommands } from '@mcp-funnel/commands-core';
import { resolve } from 'path';

export async function runCommand(name: string, args: string[]): Promise<void> {
  try {
    // Discover commands from packages/commands directory
    // Use process.cwd() to find the root and navigate to commands
    const commandsPath = resolve(process.cwd(), 'packages/commands');
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
