# Formatter Examples

This document demonstrates the output formatters with different verbosity levels.

## describe_file Tool

### Minimal Verbosity (default)

**Options:** `{ verbosity: 'minimal' }`

**Token Estimate:** ~120-200 tokens for typical file

```json
{
  "file": "src/command.ts",
  "symbols": [
    {
      "inline": "function executeToolViaMCP(toolName: string, args: Record<string, unknown>): Promise<CallToolResult>",
      "line": 108
    },
    {
      "inline": "class NPMCommand implements ICommand",
      "line": 36
    },
    {
      "inline": "interface CommandOptions { verbose?: boolean; dryRun?: boolean }",
      "line": 12
    }
  ],
  "tokenEstimate": 150
}
```

### Normal Verbosity

**Options:** `{ verbosity: 'normal' }`

**Token Estimate:** ~300-500 tokens for typical file

```json
{
  "file": "src/command.ts",
  "symbols": [
    {
      "inline": "function executeToolViaMCP(toolName: string, args: Record<string, unknown>): Promise<CallToolResult>",
      "line": 108,
      "usages": [
        {
          "file": "src/handlers/tool-handler.ts",
          "lines": [42, 67],
          "count": 2
        },
        {
          "file": "src/cli/runner.ts",
          "lines": [156],
          "count": 1
        }
      ]
    },
    {
      "inline": "class NPMCommand implements ICommand",
      "line": 36,
      "usages": [
        {
          "file": "src/registry.ts",
          "lines": [23],
          "count": 1
        }
      ]
    },
    {
      "inline": "interface CommandOptions { verbose?: boolean; dryRun?: boolean }",
      "line": 12,
      "usages": [
        {
          "file": "src/command.ts",
          "lines": [38, 45, 89],
          "count": 3
        }
      ]
    }
  ],
  "references": [
    {
      "name": "CallToolResult",
      "source": "@modelcontextprotocol/sdk",
      "kind": "interface"
    },
    {
      "name": "ICommand",
      "source": "@mcp-funnel/commands-core",
      "kind": "interface"
    }
  ],
  "tokenEstimate": 425
}
```

### Detailed Verbosity

**Options:** `{ verbosity: 'detailed' }`

**Token Estimate:** ~500-1000 tokens for typical file

```json
{
  "file": "src/command.ts",
  "symbols": [
    {
      "inline": "function executeToolViaMCP(toolName: string, args: Record<string, unknown>): Promise<CallToolResult>",
      "line": 108,
      "usages": [
        {
          "file": "src/handlers/tool-handler.ts",
          "lines": [42, 67],
          "count": 2
        },
        {
          "file": "src/cli/runner.ts",
          "lines": [156],
          "count": 1
        }
      ]
    },
    {
      "inline": "class NPMCommand implements ICommand",
      "line": 36,
      "usages": [
        {
          "file": "src/registry.ts",
          "lines": [23],
          "count": 1
        }
      ]
    },
    {
      "inline": "interface CommandOptions { verbose?: boolean; dryRun?: boolean }",
      "line": 12,
      "usages": [
        {
          "file": "src/command.ts",
          "lines": [38, 45, 89],
          "count": 3
        }
      ]
    }
  ],
  "references": [
    {
      "name": "CallToolResult",
      "source": "@modelcontextprotocol/sdk",
      "kind": "interface",
      "signature": "interface CallToolResult { content: Array<TextContent | ImageContent>; isError?: boolean }"
    },
    {
      "name": "ICommand",
      "source": "@mcp-funnel/commands-core",
      "kind": "interface",
      "signature": "interface ICommand { name: string; execute(args: unknown): Promise<void> }"
    }
  ],
  "tokenEstimate": 720
}
```

## describe_symbol Tool

### Minimal Verbosity (default)

**Options:** `{ verbosity: 'minimal' }`

**Token Estimate:** ~50-100 tokens

```json
{
  "symbol": {
    "id": "src/command.ts#executeToolViaMCP",
    "name": "executeToolViaMCP",
    "kind": "function",
    "signature": "function executeToolViaMCP(toolName: string, args: Record<string, unknown>): Promise<CallToolResult>",
    "file": "src/command.ts",
    "line": 108,
    "isExported": true
  },
  "tokenEstimate": 75
}
```

### Normal Verbosity

**Options:** `{ verbosity: 'normal' }`

**Token Estimate:** ~150-300 tokens

```json
{
  "symbol": {
    "id": "src/command.ts#executeToolViaMCP",
    "name": "executeToolViaMCP",
    "kind": "function",
    "signature": "function executeToolViaMCP(toolName: string, args: Record<string, unknown>): Promise<CallToolResult>",
    "file": "src/command.ts",
    "line": 108,
    "isExported": true
  },
  "usages": [
    {
      "file": "src/handlers/tool-handler.ts",
      "lines": [42, 67],
      "count": 2
    },
    {
      "file": "src/cli/runner.ts",
      "lines": [156],
      "count": 1
    }
  ],
  "references": [
    {
      "name": "CallToolResult",
      "source": "@modelcontextprotocol/sdk",
      "kind": "interface"
    }
  ],
  "tokenEstimate": 220
}
```

### Detailed Verbosity

**Options:** `{ verbosity: 'detailed' }`

**Token Estimate:** ~300-600 tokens

```json
{
  "symbol": {
    "id": "src/command.ts#executeToolViaMCP",
    "name": "executeToolViaMCP",
    "kind": "function",
    "signature": "function executeToolViaMCP(toolName: string, args: Record<string, unknown>): Promise<CallToolResult>",
    "file": "src/command.ts",
    "line": 108,
    "isExported": true
  },
  "usages": [
    {
      "file": "src/handlers/tool-handler.ts",
      "lines": [42, 67],
      "count": 2
    },
    {
      "file": "src/cli/runner.ts",
      "lines": [156],
      "count": 1
    }
  ],
  "references": [
    {
      "name": "CallToolResult",
      "source": "@modelcontextprotocol/sdk",
      "kind": "interface",
      "signature": "interface CallToolResult { content: Array<TextContent | ImageContent>; isError?: boolean }"
    }
  ],
  "tokenEstimate": 380
}
```

## Progressive Disclosure Benefits

### Token Usage Comparison

For a typical file with 10 symbols:

| Verbosity | Tokens | Use Case |
|-----------|--------|----------|
| Minimal   | 100-200 | Quick overview, navigation hints |
| Normal    | 300-500 | Understanding dependencies, finding usages |
| Detailed  | 500-1000 | Deep analysis, type exploration |

### Custom Options

You can override default behavior with explicit options:

```typescript
// Get minimal output but include usages
const output = formatFile(symbols, {
  verbosity: 'minimal',
  includeUsages: true
});

// Get detailed output but exclude references
const output = formatFile(symbols, {
  verbosity: 'detailed',
  includeReferences: false
});

// Custom depth for nested structures
const output = formatFile(symbols, {
  verbosity: 'normal',
  maxDepth: 5
});
```

## Usage in Tools

### describe_file Tool Implementation

```typescript
import { formatFile } from '@mcp-funnel/command-tsci';

// Minimal by default for AI context efficiency
const result = formatFile(symbols);

// User can request more detail
const detailedResult = formatFile(symbols, {
  verbosity: 'detailed'
});
```

### describe_symbol Tool Implementation

```typescript
import { formatSymbol } from '@mcp-funnel/command-tsci';

// Minimal by default
const result = formatSymbol(symbolMetadata);

// With usages for dependency analysis
const withUsages = formatSymbol(symbolMetadata, {
  verbosity: 'normal'
});
```

## Design Principles

1. **Minimal by default**: Start with least tokens
2. **Progressive disclosure**: Add detail on demand
3. **Token awareness**: Estimate tokens for AI context planning
4. **Structured output**: JSON for easy AI parsing
5. **Inline signatures**: Most important info upfront
6. **Line numbers**: For navigation and verification
