# MCP Registry Integration

The MCP Registry integration enables discovery and installation of Model Context Protocol servers from the official
registry. This feature provides tools to search for available servers and retrieve their installation configurations.

## Overview

The registry integration provides two primary capabilities:
- **Server Discovery**: Search the MCP registry to find servers matching your needs
- **Installation Guidance**: Get detailed configuration snippets and instructions for any server

## Available Tools

### 1. `search_registry_tools`

Search the MCP registry for servers by keywords.

**Parameters:**
- `keywords` (required): Space-separated keywords to search for in server names, descriptions, and tool names
- `registry` (optional): Registry ID or URL to search within a specific registry
  - Use `"official"` for the main MCP registry
  - Or provide a full registry URL

**Example Usage:**
```
search_registry_tools keywords="github code review"
search_registry_tools keywords="github" registry="official"
```

**Returns:** Minimal server information optimized for token efficiency:
- Server name
- Brief description
- Registry ID (for retrieving full details)
- Server type (Local/Remote)
- Registry type

### 2. `get_server_install_info`

Retrieve detailed installation instructions and configuration for a specific server.

**Parameters:**
- `registryId` (required): The server identifier, which can be:
  - A server name (e.g., "github-mcp-server")
  - A UUID (e.g., "a8a5c761-c1dc-4d1d-9100-b57df4c9ec0d")
  - The registry ID from search results

**Example Usage:**
```
get_server_install_info registryId="github-mcp-server"
get_server_install_info registryId="a8a5c761-c1dc-4d1d-9100-b57df4c9ec0d"
```

**Returns:** Complete installation information:
- Server name and description
- Configuration snippet ready to add to your `.mcp-funnel.json`
- Installation instructions specific to the package type
- List of available tools the server provides

## Configuration Format

The registry system generates configuration snippets compatible with mcp-funnel's `.mcp-funnel.json` format.
Configurations are automatically generated based on the server's package type.

### Supported Package Types

#### NPM Packages
Servers distributed via npm are configured with the `npx` command:
```json
{
  "name": "example-npm-server",
  "command": "npx",
  "args": ["-y", "@org/package-name"]
}
```

#### Python Packages (PyPI)
Python servers use `uvx` for execution:
```json
{
  "name": "example-python-server",
  "command": "uvx",
  "args": ["package-name"]
}
```

#### OCI Containers
Container-based servers run via Docker:
```json
{
  "name": "example-container-server",
  "command": "docker",
  "args": ["run", "-i", "--rm", "registry.io/image:tag"]
}
```

#### Remote Servers
Remote servers are accessed via HTTP/HTTPS:
```json
{
  "name": "example-remote-server",
  "url": "https://api.example.com/mcp",
  "transport": "sse",
  "headers": {
    "Authorization": "Bearer ${API_TOKEN}"
  }
}
```

Note: Headers can include environment variable references using `${VAR_NAME}` syntax.

## Usage Workflow

1. **Search for servers** using relevant keywords:
   ```
   search_registry_tools keywords="filesystem git"
   ```

2. **Review search results** to find servers matching your needs

3. **Get installation details** using the registry ID:
   ```
   get_server_install_info registryId="server-id-from-search"
   ```

4. **Add the configuration** to your `.mcp-funnel.json` file

5. **Follow installation instructions** specific to the package type

## Example: Complete Installation Flow

### Step 1: Search for GitHub-related servers
```
> search_registry_tools keywords="github"
```

Response:
```
Found 3 servers matching your search:

• github-mcp-server (github-mcp-server)
  MCP server for GitHub API integration
  Type: Local | Registry: npm

• github-actions-server (gh-actions-mcp)
  Manage GitHub Actions workflows via MCP
  Type: Local | Registry: npm

• github-copilot-bridge (copilot-bridge)
  Bridge GitHub Copilot with MCP tools
  Type: Remote | Registry: unknown

💡 Use get_server_install_info with a registryId to get installation details for any server.
```

### Step 2: Get installation info for a specific server
```
> get_server_install_info registryId="github-mcp-server"
```

Response:
```json
{
  "name": "github-mcp-server",
  "description": "MCP server for GitHub API integration",
  "configSnippet": {
    "name": "github-mcp-server",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "installInstructions": "1. Ensure you have Node.js installed\n2. Set your GITHUB_TOKEN environment variable\n3. Add the configuration snippet to your .mcp-funnel.json\n4. Restart mcp-funnel to load the new server",
  "tools": [
    "create_issue",
    "list_issues",
    "get_pull_request",
    "create_pull_request",
    "list_repositories"
  ]
}
```

### Step 3: Add to configuration
Add the `configSnippet` to your `.mcp-funnel.json`:
```json
{
  "servers": [
    {
      "name": "github-mcp-server",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  ]
}
```

## Advanced Configuration

### Custom Runtime Commands

The registry system respects server-specified runtime hints, allowing flexibility in how packages are executed:

```json
{
  "name": "custom-npm-server",
  "command": "node",
  "args": ["path/to/server.js"]
}
```

Supported runtime customizations:
- **NPM**: Can use `npx`, `node`, `yarn dlx`, `pnpm dlx`, etc.
- **Python**: Can use `uvx`, `pipx`, `poetry run`, `python -m`, etc.
- **OCI**: Can use `docker`, `podman`, etc.

### Environment Variables

Servers can specify required and optional environment variables:

```json
{
  "name": "api-server",
  "command": "npx",
  "args": ["-y", "@org/api-server"],
  "env": {
    "API_KEY": "${API_KEY}",
    "DEBUG": "true"
  }
}
```

Environment variables support:
- Variable substitution using `${VAR_NAME}` syntax
- Required vs optional flags (metadata in server definition)
- Secret marking for sensitive values

### UUID-Based Lookup

You can retrieve server details directly using UUIDs for faster access:

```
get_server_install_info registryId="a8a5c761-c1dc-4d1d-9100-b57df4c9ec0d"
```

The system automatically detects UUIDs and uses the optimal API endpoint for retrieval.

## Architecture

The registry integration is built with extensibility in mind, featuring:

### Singleton Pattern
The `RegistryContext` class implements a singleton pattern to ensure consistent state and shared resources across all registry operations.

### Caching Layer (TODO)
The architecture includes a caching abstraction layer with a pluggable interface. Currently uses a no-op implementation for MVP, with plans for real caching in Phase 2 to reduce API calls and improve response times.

### Configuration Management
A flexible configuration system supports multiple package types and generates appropriate configuration snippets for each.

### Token Efficiency
Search results return minimal information to reduce token usage, with full details available on demand via `get_server_install_info`.

## Error Handling

The registry system implements a robust two-layer error handling architecture:

### Client Layer
- Throws detailed errors with specific error messages
- Preserves full error context for debugging
- Provides clear status codes and error descriptions

### Context Layer
- Catches errors from individual registry clients
- Continues operation even if some registries fail
- Aggregates errors and provides graceful degradation
- Returns partial results when available

This architecture ensures:
- Network failures don't crash the system
- Multiple registries can be queried with partial success
- Invalid registry IDs return clear "not found" messages
- Malformed requests provide specific validation errors

## Registry API

The system connects to the official MCP registry at:
- Primary endpoint: `https://registry.modelcontextprotocol.io`

The registry API provides:
- Server search with keyword matching
- Individual server detail retrieval
- Package distribution information
- Tool listings for each server

## Best Practices

1. **Use specific keywords** when searching to get more relevant results
2. **Check tool lists** before installing to ensure the server provides needed functionality
3. **Review environment variables** required by servers before installation
4. **Test servers individually** after adding to configuration
5. **Keep registry IDs** from search results for later reference

## Troubleshooting

### No search results
- Try broader keywords
- Check spelling and terminology
- Ensure network connectivity to the registry

### Server not found by ID
- Verify the registry ID from search results
- The server may have been removed from the registry
- Try searching again with related keywords

### Configuration not working
- Ensure all required environment variables are set
- Check that the package manager (npm/pip/docker) is installed
- Verify network access to package repositories
- Review server-specific installation instructions

## Current Limitations

- Configuration changes require manual editing of `.mcp-funnel.json`
- After adding or modifying servers in `.mcp-funnel.json`, you need to restart the mcp-funnel proxy process 
  for changes to take effect (the proxy doesn't hot-reload configuration)
- The current implementation uses a no-op cache (NoOpCache) that doesn't actually store anything -
  all registry API calls fetch fresh data every time
- Registry search is keyword-based without advanced filtering options