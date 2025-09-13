# @mcp-funnel/command-ts-validate

TypeScript, ESLint, and Prettier validation command for monorepos. Works both via CLI and MCP protocol.

## Features

- ✅ **Prettier** formatting validation and auto-fix
- ✅ **ESLint** linting with auto-fix support
- ✅ **TypeScript** type checking
- ✅ **Monorepo** support with glob patterns
- ✅ **Dual Interface**: CLI and MCP protocol
- ✅ **Caching** for faster subsequent runs
- ✅ **JSON Output** for programmatic consumption

## Quick Start

### Try it via CLI

```bash
# From the monorepo root
cd /Users/d635861/WorkBench/mcp-funnel/mcp-funnel-main

# Run validation on specific files
npx mcp-funnel run validate packages/mcp/src/cli.ts

# Run with auto-fix
npx mcp-funnel run validate --fix packages/commands/core/src/*.ts

# Run on all TypeScript files in a package
npx mcp-funnel run validate "packages/mcp/**/*.ts"

# Get JSON output for AI/programmatic use
npx mcp-funnel run validate --json packages/commands

# Show help
npx mcp-funnel run validate --help

# Or use the convenience script
yarn validate:new packages/commands
```

### Try it via MCP (with Claude)

1. **Configure MCP Funnel** to expose the command:

Create or update `.mcp-funnel.json`:

```json
{
  "servers": [
    // ... your other servers
  ],
  "commands": {
    "enabled": true,
    "tools": ["validate"]
  }
}
```

2. **Add to Claude Desktop** config:

```json
{
  "mcpServers": {
    "mcp-funnel": {
      "command": "npx",
      "args": ["mcp-funnel", "/path/to/.mcp-funnel.json"]
    }
  }
}
```

3. **Use in Claude**:

```
Claude, please run TypeScript validation on the packages/mcp directory and fix any issues.
```

Claude will see the command as `cmd__validate` and can call it with:

```json
{
  "glob": "packages/mcp/**/*.ts",
  "fix": true
}
```

## CLI Usage

### Basic Commands

```bash
# Validate current directory
npx mcp-funnel run validate

# Validate specific files
npx mcp-funnel run validate file1.ts file2.ts

# Validate with glob pattern
npx mcp-funnel run validate "src/**/*.{ts,tsx}"

# Auto-fix issues
npx mcp-funnel run validate --fix

# JSON output
npx mcp-funnel run validate --json

# No cache
npx mcp-funnel run validate --no-cache

# Show suggested actions
npx mcp-funnel run validate --show-actions
```

### CLI Options

- `--fix` - Automatically fix fixable issues (Prettier and ESLint)
- `--json` - Output results as JSON
- `--no-cache` - Disable ESLint caching
- `--show-actions` - Show suggested actions for fixes
- `--help` - Show help message

## MCP Protocol Usage

When exposed via MCP, the command accepts these parameters:

```typescript
{
  "files": ["file1.ts", "file2.ts"],  // Specific files
  "glob": "src/**/*.ts",               // OR glob pattern
  "fix": true,                         // Auto-fix issues
  "cache": true                        // Use cache (default: true)
}
```

Returns a JSON result with:

```typescript
{
  "fileResults": {
    "path/to/file.ts": [
      {
        "tool": "prettier" | "eslint" | "typescript",
        "message": "Error message",
        "severity": "error" | "warning" | "info",
        "line": 10,
        "column": 5,
        "fixable": true,
        "fixedAutomatically": false
      }
    ]
  },
  "totalFiles": 5,
  "filesWithErrors": 2,
  "fixableFiles": ["file1.ts"],
  "unfixableFiles": ["file2.ts"],
  "suggestedActions": [
    {
      "file": "file1.ts",
      "action": "prettier-fix",
      "description": "Run prettier --write on this file"
    }
  ]
}
```

## Output Examples

### Human-Readable Output (CLI)

```
Validation Results:

packages/mcp/src/cli.ts:
  ❌ [eslint:10:5] 'unused' is defined but never used (@typescript-eslint/no-unused-vars)
     💡 Fixable: auto-fix available
  ⚠️ [prettier] File needs formatting
     💡 Fixable: auto-fix available

📊 Summary:
  Total files checked: 10
  Files with issues: 2
  Auto-fixable files: 2
```

### JSON Output

```json
{
  "fileResults": {
    "packages/mcp/src/cli.ts": [
      {
        "tool": "eslint",
        "message": "'unused' is defined but never used",
        "severity": "error",
        "line": 10,
        "column": 5,
        "ruleId": "@typescript-eslint/no-unused-vars",
        "fixable": true
      }
    ]
  },
  "totalFiles": 10,
  "filesWithErrors": 2,
  "fixableFiles": ["packages/mcp/src/cli.ts"],
  "unfixableFiles": [],
  "suggestedActions": [...]
}
```

## Development

### Building

```bash
cd packages/commands/validate
yarn build
```

### Testing

```bash
# Run validation on the command itself
npx mcp-funnel run validate packages/commands/validate
```

## Configuration

The command respects your project's configuration files:

- `.prettierrc` / `prettier.config.js` - Prettier configuration
- `.eslintrc` / `eslint.config.js` - ESLint configuration
- `tsconfig.json` - TypeScript configuration
- `.prettierignore` - Files to ignore for Prettier
- `.eslintignore` - Files to ignore for ESLint

## Exit Codes

- `0` - All validations passed
- `1` - Validation errors found

## Performance

- **Caching**: ESLint caching is enabled by default for faster subsequent runs
- **Parallel Processing**: Prettier, ESLint, and TypeScript validations run in parallel
- **Smart File Resolution**: Only processes relevant files based on patterns

## Troubleshooting

### No files found

- Check your glob pattern syntax
- Ensure files aren't ignored by `.gitignore`, `.prettierignore`, or `.eslintignore`

### TypeScript errors not showing

- Ensure `tsconfig.json` exists in your project root
- Check that files are included in your TypeScript configuration

### Auto-fix not working

- Some issues require manual fixes (TypeScript errors, complex ESLint rules)
- Check file permissions

## License

MIT
