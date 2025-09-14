# Migration Guide: Single to Multi-Tool Interface

This document explains how to migrate commands from the old single-tool interface to the new multi-tool interface.

## Overview

The ICommand interface has been updated to support commands that can expose multiple tools through the MCP protocol. This allows for more flexible command design where a single command implementation can provide several related tools.

## Interface Changes

### Old Interface (Single Tool)

```typescript
export interface ICommand {
  readonly name: string;
  readonly description: string;

  executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult>;
  executeViaCLI(args: string[]): Promise<void>;
  getMCPDefinition(): Tool;
}
```

### New Interface (Multi-Tool)

```typescript
export interface ICommand {
  readonly name: string;
  readonly description: string;

  executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult>;
  executeViaCLI(args: string[]): Promise<void>;
  getMCPDefinitions(): Tool[];
}
```

## Migration Steps

### 1. Update Method Signatures

**Change `getMCPDefinition()` to `getMCPDefinitions()`:**

```typescript
// Before
getMCPDefinition(): Tool {
  return {
    name: this.name,
    description: this.description,
    inputSchema: { /* ... */ }
  };
}

// After
getMCPDefinitions(): Tool[] {
  return [
    {
      name: this.name,
      description: this.description,
      inputSchema: { /* ... */ }
    }
  ];
}
```

**Add `executeToolViaMCP()` method:**

```typescript
// Add this new method
async executeToolViaMCP(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  // For single-tool commands, delegate to the original implementation
  return this.executeViaMCP(args);
}

// Keep the existing method for backward compatibility
async executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult> {
  // Your existing implementation
}
```

### 2. Tool Naming in MCP

With the new interface, tools are exposed in MCP with the naming convention:

- Single-tool command: `cmd__[commandName]__[toolName]`
- Multiple-tool command: `cmd__[commandName]__[tool1Name]`, `cmd__[commandName]__[tool2Name]`, etc.

For single-tool commands where the command name and tool name are the same (like ts-validate), the MCP tool name becomes `ts-validate`. Legacy aliases `cmd__ts-validate` and `cmd__ts-validate__ts-validate` are still accepted for calls but are no longer listed.

For multi-tool commands, the MCP tools are compacted to `<command>_<tool>` (e.g., `npm_lookup`, `npm_search`). Legacy aliases `cmd__<command>__<tool>` are still accepted for calls but are no longer listed.

## Example: ts-validate Migration

### Before (Old Interface)

```typescript
export class TsValidateCommand implements ICommand {
  readonly name = 'ts-validate';
  readonly description = 'Run prettier, eslint, and TypeScript validation';

  async executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult> {
    // Implementation
  }

  async executeViaCLI(args: string[]): Promise<void> {
    // Implementation
  }

  getMCPDefinition(): Tool {
    return {
      name: this.name,
      description: this.description,
      inputSchema: {
        /* ... */
      },
    };
  }
}
```

### After (New Interface)

```typescript
export class TsValidateCommand implements ICommand {
  readonly name = 'ts-validate';
  readonly description = 'Run prettier, eslint, and TypeScript validation';

  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    // For single-tool commands, delegate to the original implementation
    return this.executeViaMCP(args);
  }

  async executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult> {
    // Same implementation as before
  }

  async executeViaCLI(args: string[]): Promise<void> {
    // Same implementation as before
  }

  getMCPDefinitions(): Tool[] {
    return [
      {
        name: this.name,
        description: this.description,
        inputSchema: {
          /* ... */
        },
      },
    ];
  }
}
```

## Multi-Tool Command Example

For commands that want to expose multiple tools:

```typescript
export class FileToolsCommand implements ICommand {
  readonly name = 'file-tools';
  readonly description = 'File manipulation tools';

  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    switch (toolName) {
      case 'file-read':
        return this.handleFileRead(args);
      case 'file-write':
        return this.handleFileWrite(args);
      case 'file-delete':
        return this.handleFileDelete(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  getMCPDefinitions(): Tool[] {
    return [
      {
        name: 'file-read',
        description: 'Read file contents',
        inputSchema: {
          /* ... */
        },
      },
      {
        name: 'file-write',
        description: 'Write file contents',
        inputSchema: {
          /* ... */
        },
      },
      {
        name: 'file-delete',
        description: 'Delete a file',
        inputSchema: {
          /* ... */
        },
      },
    ];
  }

  // ... other methods
}
```

## Backward Compatibility

The migration maintains backward compatibility by:

1. Keeping the original `executeViaMCP()` method
2. Having `executeToolViaMCP()` delegate to it for single-tool commands
3. Continuing to support the same CLI interface

## Infrastructure Changes

The following infrastructure components have been updated to support the new interface:

- **CommandRegistry**: Now tracks tool-to-command mappings for MCP execution
- **Command discovery**: Updated validation to check for new method signatures
- **MCP proxy**: Updated to handle multi-tool registration and execution
- **BaseCommand**: Updated abstract class with new interface requirements

## Testing

After migration, verify:

1. **CLI functionality**: `npx mcp-funnel run [command-name] --help` works
2. **MCP registration**: Tools appear in MCP tool list with correct prefixes
3. **MCP execution**: Tools can be called via MCP protocol
4. **Validation**: `yarn validate` passes for the migrated command files

## Configuration

Update your `.mcp-funnel.json` configuration to include migrated commands:

```json
{
  "commands": {
    "enabled": true,
    "list": ["ts-validate", "other-command"]
  }
}
```

This migration enables more flexible command design while maintaining full backward compatibility with existing single-tool commands.
