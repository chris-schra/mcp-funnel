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
  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
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

  // MCP tool definitions
  getMCPDefinitions(): Tool[] {
    return [
      {
        name: this.name,
        description: this.description,
        inputSchema: {
          type: 'object',
          properties: {
            // Define your command's parameters
          },
        },
      },
    ];
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

  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const options = this.parseCommonOptions(args);
    // Implementation
  }

  async executeViaCLI(args: string[]): Promise<void> {
    const options = this.parseCommonOptions(args);
    this.log('Processing...', options);
    // Implementation
  }

  getMCPDefinitions(): Tool[] {
    // Command schema
    return [
      {
        name: this.name,
        description: this.description,
        inputSchema: {
          type: 'object',
          properties: {
            // Define your command's parameters
          },
        },
      },
    ];
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
const mcpTools = registry.getAllMCPDefinitions();

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

## Multi-Tool Commands

Commands can expose multiple tools through the MCP protocol while maintaining a single CLI interface. This pattern is useful for commands that provide related functionality grouped under a common domain.

### Overview

The multi-tool pattern allows:

- **Logical grouping**: Related operations under one command umbrella
- **Shared resources**: Common caching, configuration, error handling
- **Flexible control**: Enable/disable individual tools via configuration
- **Consistent prefixing**: All tools get the same `cmd__commandname__` prefix

### Implementation

To create a multi-tool command, implement `executeToolViaMCP` instead of `executeViaMCP`:

```typescript
import { ICommand, Tool } from '@mcp-funnel/commands-core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class MyMultiCommand implements ICommand {
  readonly name = 'multi-example';
  readonly description = 'Example multi-tool command';

  // Handle tool-specific execution via MCP
  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    switch (toolName) {
      case 'lookup':
        return this.handleLookup(args);
      case 'search':
        return this.handleSearch(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // CLI interface routes to appropriate subcommand
  async executeViaCLI(args: string[]): Promise<void> {
    const [subcommand, ...subArgs] = args;

    switch (subcommand) {
      case 'lookup':
        return this.cliLookup(subArgs);
      case 'search':
        return this.cliSearch(subArgs);
      case '--help':
      case 'help':
        return this.showHelp();
      default:
        throw new Error(`Unknown subcommand: ${subcommand}`);
    }
  }

  // Return multiple tool definitions
  getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'lookup',
        description: 'Look up specific items',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Item ID to lookup',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'search',
        description: 'Search for items',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results',
              default: 10,
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  private async handleLookup(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const { id } = args;
    // Implementation
    return {
      content: [{ type: 'text', text: `Looked up: ${id}` }],
    };
  }

  private async handleSearch(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const { query, limit = 10 } = args;
    // Implementation
    return {
      content: [{ type: 'text', text: `Search results for: ${query}` }],
    };
  }

  private async cliLookup(args: string[]): Promise<void> {
    // CLI implementation
    console.log('Lookup via CLI:', args);
  }

  private async cliSearch(args: string[]): Promise<void> {
    // CLI implementation
    console.log('Search via CLI:', args);
  }

  private showHelp(): void {
    console.log(`
Usage: npx mcp-funnel run ${this.name} <subcommand> [options]

Subcommands:
  lookup <id>        Look up item by ID
  search <query>     Search for items
  help              Show this help

Examples:
  npx mcp-funnel run ${this.name} lookup item-123
  npx mcp-funnel run ${this.name} search "test query"
    `);
  }
}
```

### MCP Tool Registration

Dev commands expose tools with compact names:

```typescript
// For a command named 'npm' with tools 'lookup' and 'search'
// Tools are exposed as:
// - npm_lookup
// - npm_search

// For a single-tool command named 'ts-validate'
// Tool is exposed as:
// - ts-validate
```

### Configuration

Control which tools are exposed:

```json
{
  "commands": {
    "enabled": true,
    "list": ["npm"]
  },
  "exposeTools": [
    "development-commands__npm_lookup", // Include specific tools
    "development-commands__npm_search"
  ],
  "hideTools": [
    "development-commands__npm_search" // Or hide specific tools
  ]
}
```

### Example: NPM Command

The NPM command demonstrates the multi-tool pattern:

```bash
# CLI usage
npx mcp-funnel run npm lookup express
npx mcp-funnel run npm search "test framework"
npx mcp-funnel run npm --help

# MCP tools exposed
npm_lookup    # Package lookup
npm_search    # Package search
```

**Benefits:**

- Shared NPM client and caching between tools
- Consistent error handling across operations
- Related functionality grouped logically
- Individual tool filtering capability

### When to Use Multi-Tool Pattern

Consider multi-tool commands for:

- **API clients**: CRUD operations (create, read, update, delete)
- **File operations**: Different file manipulations (read, write, search, validate)
- **Development tools**: Related dev operations (lint, test, build, deploy)
- **External services**: Multiple operations on the same service/API

### Single vs Multi-Tool Decision

| Use Single Tool When             | Use Multi-Tool When                        |
| -------------------------------- | ------------------------------------------ |
| Command has one clear purpose    | Command covers multiple related operations |
| No shared state or resources     | Operations share configuration/caching     |
| Unlikely to expand functionality | Planning to add related tools              |
| Simplicity is paramount          | Logical grouping provides value            |

## Examples

- **Single-tool**: `ts-validate` command in `packages/commands/ts-validate`
- **Multi-tool**: `npm` command in `packages/commands/npm-lookup`

## Contributing

When creating new commands:

1. Follow the naming convention `@mcp-funnel/command-*`
2. Implement both MCP and CLI interfaces
3. Include comprehensive input validation
4. Add proper error handling
5. Document your command's parameters in the schema

## License

MIT
