# @mcp-funnel/commands-core

Core infrastructure for building MCP Funnel development commands that work both via CLI and MCP protocol.

## Overview

This package provides the base interfaces, classes, and utilities for creating commands that can be:

- **Executed via CLI**: Direct command-line usage with `npx mcp-funnel run <command>`
- **Called via MCP**: Exposed through the MCP protocol for AI assistants

## Installation

```bash
yarn add @mcp-funnel/commands-core
```

## Creating a Command

### 1. Implement the ICommand Interface

```typescript
import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';

export class MyCommand implements ICommand {
  readonly name = 'my-command';
  readonly description = 'Description of what my command does';

  // For MCP execution (returns JSON)
  async executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult> {
    // Process args and return result
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true }),
        },
      ],
    };
  }

  // For CLI execution (console output)
  async executeViaCLI(args: string[]): Promise<void> {
    // Parse CLI args and output to console
    console.log('Command executed!');
  }

  // MCP tool definition
  getMCPDefinition(): Tool {
    return {
      name: this.name,
      description: this.description,
      inputSchema: {
        type: 'object',
        properties: {
          // Define your command's parameters
        },
      },
    };
  }
}
```

### 2. Or Extend BaseCommand

```typescript
import { BaseCommand } from '@mcp-funnel/commands-core';

export class MyCommand extends BaseCommand {
  readonly name = 'my-command';
  readonly description = 'My command description';

  // BaseCommand provides helpers like:
  // - parseCommonOptions() for parsing --verbose, --dry-run, etc.
  // - log() and logError() for output handling

  async executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult> {
    const options = this.parseCommonOptions(args);
    // Implementation
  }

  async executeViaCLI(args: string[]): Promise<void> {
    const options = this.parseCommonOptions(args);
    this.log('Processing...', options);
    // Implementation
  }

  getMCPDefinition(): Tool {
    // Command schema
  }
}
```

### 3. Package Structure

Create your command package:

```
packages/commands/my-command/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts      # Export your command
│   └── command.ts    # Command implementation
└── dist/
    └── index.js      # Built output
```

**package.json:**

```json
{
  "name": "@mcp-funnel/command-my-command",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js"
  }
}
```

**src/index.ts:**

```typescript
import { MyCommand } from './command.js';

// Default export for auto-discovery
export default new MyCommand();

// Named export for programmatic use
export { MyCommand };
```

## Command Discovery

The discovery system automatically finds commands in `packages/commands/*`:

```typescript
import { discoverCommands } from '@mcp-funnel/commands-core';

const registry = await discoverCommands('./packages/commands');

// Get all discovered commands
const commandNames = registry.getAllCommandNames();

// Get a specific command
const command = registry.getCommandForCLI('my-command');
if (command) {
  await command.executeViaCLI(['--help']);
}
```

## Command Registry

Manually register commands:

```typescript
import { CommandRegistry } from '@mcp-funnel/commands-core';
import { MyCommand } from './my-command.js';

const registry = new CommandRegistry();
registry.register(new MyCommand());

// For MCP
const mcpTools = registry.getAllMCPTools();

// For CLI
const command = registry.getCommandForCLI('my-command');
```

## API Reference

### Interfaces

- **`ICommand`**: Core command interface
- **`ICommandMetadata`**: Command metadata (name, version, author, tags)
- **`ICommandOptions`**: Common command options (verbose, dryRun, etc.)

### Classes

- **`BaseCommand`**: Abstract base class with common functionality
- **`CommandRegistry`**: Registry for managing commands

### Functions

- **`discoverCommands(searchPath)`**: Auto-discover commands from directory
- **`discoverCommandsFromDefault()`**: Discover from default location

## Examples

See the `ts-validate` command in `packages/commands/ts-validate` for a complete example.

## Contributing

When creating new commands:

1. Follow the naming convention `@mcp-funnel/command-*`
2. Implement both MCP and CLI interfaces
3. Include comprehensive input validation
4. Add proper error handling
5. Document your command's parameters in the schema

## License

MIT
