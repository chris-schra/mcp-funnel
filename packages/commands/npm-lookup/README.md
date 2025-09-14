# NPM Lookup Command

A powerful NPM package discovery and information retrieval tool for MCP Funnel. This command provides comprehensive package lookup and search capabilities directly through the NPM registry API.

## Overview

The NPM command exposes two primary tools:

- **lookup**: Get detailed information about a specific package
- **search**: Find packages matching a search query

When exposed via MCP, these tools appear as `npm_lookup` and `npm_search`.

## Features

- **Package Lookup**: Get comprehensive package information including dependencies, metadata, and statistics
- **Package Search**: Search for packages with ranking and relevance scoring
- **Built-in Caching**: 5-minute cache for both lookup and search results to improve performance
- **Error Handling**: Robust error handling with specific error types for different failure scenarios
- **Rate Limiting Friendly**: Respects NPM registry rate limits with intelligent caching

## Installation

The NPM command is part of the MCP Funnel commands suite:

```bash
# Install MCP Funnel (includes npm command)
yarn add @mcp-funnel/commands-npm-lookup

# Or install the entire MCP Funnel suite
git clone https://github.com/edgora-hq/mcp-funnel.git
cd mcp-funnel
yarn install
```

## CLI Usage

### Package Lookup

```bash
# Look up a specific package
npx mcp-funnel run npm lookup express

# Look up a scoped package
npx mcp-funnel run npm lookup @types/node

# Look up with full package details
npx mcp-funnel run npm lookup react
```

### Package Search

```bash
# Search for packages
npx mcp-funnel run npm search "test framework"

# Search with specific terms
npx mcp-funnel run npm search "typescript utility"

# Search for specific functionality
npx mcp-funnel run npm search "date manipulation"
```

### Help

```bash
# Get help for npm command
npx mcp-funnel run npm --help

# Get help for specific subcommands
npx mcp-funnel run npm lookup --help
npx mcp-funnel run npm search --help
```

## MCP Tool Descriptions

When used via MCP (Model Context Protocol), the NPM command exposes these tools:

### `npm_lookup`

Retrieves detailed information about a specific NPM package.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "packageName": {
      "type": "string",
      "description": "The name of the NPM package to lookup (e.g., 'express', '@types/node')"
    }
  },
  "required": ["packageName"]
}
```

**Usage Example:**

```javascript
// Via MCP client
{
  "tool": "npm_lookup",
  "arguments": {
    "packageName": "express"
  }
}
```

### `npm_search`

Searches for NPM packages matching a query string.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query string (e.g., 'test framework', 'typescript utilities')"
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of results to return (1–50, default: 20)",
      "minimum": 1,
      "maximum": 50
    }
  },
  "required": ["query"]
}
```

**Usage Example:**

```javascript
// Via MCP client
{
  "tool": "npm_search",
  "arguments": {
    "query": "typescript testing framework",
    "limit": 10
  }
}
```

## Configuration

To use the NPM command with MCP Funnel, add it to your `.mcp-funnel.json`:

```json
{
  "commands": {
    "enabled": true,
    "list": ["npm"]
  },
  "exposeTools": [
    "development-commands__npm_lookup",
    "development-commands__npm_search"
  ]
}
```

### Filtering Specific Tools

The `commands.list` array specifies which commands to enable. To use multiple commands:

```json
{
  "commands": {
    "enabled": true,
    "list": ["npm", "ts-validate"]
  },
  "exposeTools": [
    "development-commands__npm_lookup",
    "development-commands__npm_search",
    "development-commands__ts-validate"
  ]
}
```

To hide specific NPM tools you don't need:

```json
{
  "commands": {
    "enabled": true,
    "list": ["npm"]
  },
  "hideTools": [
    "development-commands__npm_search" // Hide search, keep only lookup
  ]
}
```

## API Response Formats

### Lookup Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "Package Information:\n\nName: express\nVersion: 4.18.2\nDescription: Fast, unopinionated, minimalist web framework for node.\n\nAuthor: TJ Holowaychuk\nLicense: MIT\nHomepage: http://expressjs.com/\n\nRepository:\n  Type: git\n  URL: git+https://github.com/expressjs/express.git\n\nKeywords: express, framework, sinatra, web, rest, restful, router, app, api\n\nDependencies:\n  accepts: ^1.3.8\n  array-flatten: 1.1.1\n  body-parser: 1.20.1\n  cookie: 0.5.0\n  cookie-signature: 1.0.6\n  ...\n\nPublished: 2022-10-08T22:56:21.000Z"
    }
  ]
}
```

### Search Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "Search Results (20 total):\n\n1. express (Score: 0.89)\n   Version: 4.18.2\n   Description: Fast, unopinionated, minimalist web framework for node.\n   Author: TJ Holowaychuk\n   Keywords: express, framework, sinatra, web, rest, restful, router, app, api\n   Published: 2022-10-08\n\n2. koa (Score: 0.76)\n   Version: 2.14.2\n   Description: Koa web app framework\n   Author: TJ Holowaychuk\n   Keywords: web, app, http, application, framework, middleware, rack\n   Published: 2023-03-10\n\n..."
    }
  ]
}
```

## Error Handling

The NPM command provides specific error types for different scenarios:

### PackageNotFoundError

Thrown when a package doesn't exist in the NPM registry.

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Package \"nonexistent-package-xyz\" not found on NPM registry"
    }
  ],
  "isError": true
}
```

### NPMRegistryError

Thrown when the NPM registry API returns an error or is unreachable.

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: NPM registry returned 500: Internal Server Error"
    }
  ],
  "isError": true
}
```

## Caching

The NPM command includes built-in caching to improve performance and reduce API calls:

- **Cache Duration**: 5 minutes for both lookup and search results
- **Cache Keys**: Unique per package name (lookup) and query+limit (search)
- **Memory-based**: Cache is in-memory and resets when the command is restarted

## Troubleshooting

### Common Issues

**1. Package Not Found**

```
Error: Package "typo-package-name" not found on NPM registry
```

- **Solution**: Check the package name spelling and ensure it exists on NPM

**2. Network Errors**

```
Error: Failed to fetch package "express": getaddrinfo ENOTFOUND registry.npmjs.org
```

- **Solution**: Check your internet connection and NPM registry accessibility

**3. Rate Limiting**

```
Error: NPM registry returned 429: Too Many Requests
```

- **Solution**: Wait a moment and retry. The built-in caching helps reduce API calls

**4. Large Search Results**

```
Search query returned too many results, consider refining your search
```

- **Solution**: Use more specific search terms or reduce the limit parameter

### Debug Mode

Enable debug logging by setting the `DEBUG` environment variable:

```bash
DEBUG=mcp-funnel:npm npx mcp-funnel run npm lookup express
```

## Performance Considerations

- **Caching**: Results are cached for 5 minutes to reduce API load
- **Truncation**: README content is truncated to 5000 characters, descriptions to 500
- **Concurrent Requests**: Multiple concurrent requests are handled efficiently
- **Memory Usage**: Cache uses minimal memory and automatically expires old entries

## Related Commands

- [Core Commands](../core/README.md) - Base command functionality
- [TypeScript Validation](../ts-validate/README.md) - TypeScript code validation
- [Web Interface](../../web/README.md) - Web-based MCP Funnel interface

## Contributing

See the main [MCP Funnel Contributing Guide](../../../CONTRIBUTING.md) for development setup and guidelines.

## License

MIT - See the main MCP Funnel license file.
