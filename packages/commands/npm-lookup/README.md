# @mcp-funnel/command-npm-lookup

NPM package search and lookup tool for CLI and MCP protocol usage.

## Features

- ✅ **Package Lookup** - Get comprehensive package information
- ✅ **Package Search** - Find packages with relevance scoring
- ✅ **Built-in Caching** - 5-minute cache for improved performance
- ✅ **Dual Interface** - CLI and MCP protocol
- ✅ **Rate Limit Friendly** - Respects NPM registry limits

## Quick Start

### Try it via CLI

```bash
# Look up a specific package
npx mcp-funnel run npm lookup express

# Look up a scoped package
npx mcp-funnel run npm lookup @types/node

# Search for packages
npx mcp-funnel run npm search "test framework"

# Get help
npx mcp-funnel run npm --help
```

### Usage in Claude Code, Codex CLI, Gemini CLI

Prompt:
```
find popular test frameworks on npm
```

Claude will call `npm_search` with:
```json
{
  "query": "test framework",
  "limit": 20
}
```

Prompt:
```
get details about the express package
```

Claude will call `npm_lookup` with:
```json
{
  "packageName": "express"
}
```

## CLI Usage

### Package Lookup

```bash
# Look up any package
npx mcp-funnel run npm lookup <package-name>

# Examples
npx mcp-funnel run npm lookup react
npx mcp-funnel run npm lookup @types/node
```

### Package Search

```bash
# Search packages
npx mcp-funnel run npm search "<query>"

# Examples
npx mcp-funnel run npm search "date manipulation"
npx mcp-funnel run npm search "typescript utility"
```

## MCP Protocol Usage

When exposed via MCP, the command provides two tools:

### `npm_lookup`

Get detailed information about a specific NPM package.

**Input Schema:**

```typescript
{
  "packageName": string  // e.g., 'express', '@types/node'
}
```

**Example:**

```json
{
  "tool": "npm_lookup",
  "arguments": {
    "packageName": "express"
  }
}
```

### `npm_search`

Search for NPM packages matching a query.

**Input Schema:**

```typescript
{
  "query": string,      // e.g., 'test framework', 'typescript utilities'
  "limit": number?      // 1-50, default: 20
}
```

**Example:**

```json
{
  "tool": "npm_search",
  "arguments": {
    "query": "typescript testing framework",
    "limit": 10
  }
}
```

## Configuration

Add the NPM command to your `.mcp-funnel.json`:

```json
{
  "commands": {
    "enabled": true,
    "list": ["npm"]
  },
  "exposeTools": ["npm_*"]
}
```

### Filtering Tools

Use `exposeTools` to expose only specific tools:

```json
{
  "commands": {
    "enabled": true,
    "list": ["npm"]
  },
  "exposeTools": [
    "npm_search"
  ]
}
```

## Caching

Results are cached in-memory for 5 minutes to improve performance and reduce NPM registry API calls.

## License

MIT
