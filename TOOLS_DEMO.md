# MCP Tools Demo Guide

Quick guide to try out the new tool system both via CLI and MCP.

## 🚀 CLI Demo (Quick Start)

```bash
# From the monorepo root
cd /Users/d635861/WorkBench/mcp-funnel/mcp-funnel-main

# 1. Build the tools (first time only)
cd packages/tools/core && yarn build && cd -
cd packages/tools/ts-validate && yarn build && cd -

# 2. Try the validation tool
npx mcp-funnel run ts-validate --help

# 3. Validate a single file
npx mcp-funnel run ts-validate packages/mcp/src/cli.ts

# 4. Validate and auto-fix
npx mcp-funnel run ts-validate --fix packages/tools/core/src

# 5. Get JSON output (for programmatic use)
npx mcp-funnel run ts-validate --json packages/tools

# 6. Or use the convenience script
yarn validate:new packages/tools
```

## 🤖 MCP Demo (With Claude)

### Step 1: Create MCP Config

Create `.mcp-funnel.json` in the project root:

```json
{
  "servers": [],
  "developmentTools": {
    "enabled": true,
    "tools": ["ts-validate"]
  }
}
```

### Step 2: Add to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-funnel-tools": {
      "command": "node",
      "args": [
        "/Users/d635861/WorkBench/mcp-funnel/mcp-funnel-main/packages/mcp/dist/cli.js",
        "/Users/d635861/WorkBench/mcp-funnel/mcp-funnel-main/.mcp-funnel.json"
      ]
    }
  }
}
```

### Step 3: Restart Claude and Test

1. Quit and restart Claude Desktop
2. Open a new conversation
3. Try these prompts:

```
"Can you validate the TypeScript code in packages/tools/core?"

"Please run ts-validate on packages/mcp and fix any issues"

"Check the code quality of packages/tools using the validation tool"
```

Claude will see the tool as `tool__ts-validate` and can call it.

## 📝 Example Outputs

### CLI Output (Human-Readable)
```
$ npx mcp-funnel run ts-validate packages/tools/core/src/index.ts

Validation Results:

packages/tools/core/src/index.ts:
  ℹ️ [prettier] File was automatically formatted

📊 Summary:
  Total files checked: 1
  Files with issues: 1
```

### MCP Output (JSON for AI)
```json
{
  "fileResults": {
    "packages/tools/core/src/index.ts": [{
      "tool": "prettier",
      "message": "File was automatically formatted",
      "severity": "info",
      "fixedAutomatically": true
    }]
  },
  "totalFiles": 1,
  "filesWithErrors": 1
}
```

## 🔧 Available Commands

### Current Tools
- `ts-validate` - TypeScript, ESLint, and Prettier validation

### Tool Management
```bash
# List available tools
npx mcp-funnel run --list

# Run specific tool
npx mcp-funnel run <tool-name> [args...]

# Get tool help
npx mcp-funnel run <tool-name> --help
```

## 🏗️ Architecture

```
CLI Mode:
User → CLI → Auto-discover tools → Execute → Console output

MCP Mode:
Claude → MCP Protocol → Load configured tools → Execute → JSON result
```

## 🎯 Key Features

1. **Dual Interface**: Same tool works via CLI and MCP
2. **Auto-Discovery**: CLI finds all tools automatically
3. **Config Control**: MCP only exposes explicitly enabled tools
4. **Type Safety**: Full TypeScript support
5. **Extensible**: Easy to add new tools

## 🆕 Creating Your Own Tool

1. Copy `packages/tools/ts-validate` as a template
2. Rename and modify for your needs
3. Implement `ITool` interface
4. Build and test
5. It's automatically available!

## 📚 More Information

- Core package: `packages/tools/core/README.md`
- Validation tool: `packages/tools/ts-validate/README.md`
- Main docs: `README.md`