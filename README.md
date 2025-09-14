# MCP Funnel

A Model Context Protocol (MCP) proxy server that aggregates multiple MCP servers into a single interface, enabling you to use tools from multiple sources simultaneously through Claude Desktop or Claude Code CLI.

## 🎯 Purpose

Most MCP servers expose all their tools with no filtering options, consuming valuable context space

MCP Funnel enables you to:

- Connect to multiple MCP servers simultaneously (GitHub, Memory, Filesystem, etc.)
- **Fine-grained tool filtering**: Hide specific tools that you don't need
- **Pattern-based filtering**: Use wildcards to hide entire categories of tools
- **Reduce context usage**: Significantly decrease token consumption by exposing only necessary tools
- Avoid tool name conflicts through automatic prefixing

## 🚀 Features

- **Multi-Server Aggregation**: Connect to any number of MCP servers
- **Tool Namespacing**: Automatic prefixing prevents naming conflicts (`github__create_issue`, `memory__store_memory`)
- **Flexible Filtering**: Show/hide tools using wildcard patterns
- **Granular Control**: Filter individual tools that servers don't allow you to disable
- **Context Optimization**: Reduce MCP tool context usage by 40-60% through selective filtering
- **Custom Transports**: Supports stdio-based MCP servers (Docker, NPX, local binaries)
- **Server Log Prefixing**: Clear identification of which server is logging what
- **Dynamic Tool Discovery**: Experimental feature for reducing initial context usage (see limitations)
- **Hacky Discovery Mode**: Ultra-minimal context mode exposing only 3 tools with dynamic bridging (95%+ context reduction)

## 📋 Prerequisites

- Node.js 18+ and npm/yarn
- [tsx](https://github.com/privatenumber/tsx) for running TypeScript directly
- MCP servers you want to proxy (installed separately)

## 🔧 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-funnel.git
cd mcp-funnel

# Install dependencies
yarn install

# Create your configuration
cp .mcp-funnel.example.json .mcp-funnel.json
# Edit .mcp-funnel.json with your servers
```

## ⚙️ Configuration

MCP Funnel supports two ways to specify configuration:

1. **Implicit** (default): Looks for `.mcp-funnel.json` in the current working directory

   ```bash
   npx mcp-funnel  # Uses ./.mcp-funnel.json
   ```

2. **Explicit**: Specify a custom config file path

   ```bash
   npx mcp-funnel /path/to/config.json
   ```

3. **User Base Config (merged automatically)**

   If present, `~/.mcp-funnel/.mcp-funnel.json` is merged with the project config. Project values override user base values. Arrays are replaced (no concatenation).

Create a `.mcp-funnel.json` file in your project directory:

```json
{
  "servers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "--env-file",
        ".env",
        "-i",
        "--rm",
        "ghcr.io/github/github-mcp-server"
      ]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/directory"
      ]
    }
  },
  "hideTools": [
    "github__list_workflow_runs",
    "github__get_workflow_run_logs",
    "memory__debug_*",
    "memory__dashboard_*",
    "github__get_team_members"
  ],
  "enableDynamicDiscovery": false,
  "hackyDiscovery": false
}
```

### Configuration Options

- **servers**: Record of MCP servers to connect to (server name as key)
  - Key: Server name (used as tool prefix)
  - `command`: Command to execute
  - `args`: Command arguments (optional)
  - `env`: Environment variables (optional)
- **alwaysVisibleTools**: Patterns for tools that are always exposed, bypassing discovery mode (optional)
- **exposeTools**: Include patterns for external tools to expose (optional)
- **hideTools**: Exclude patterns for external tools to hide (optional)
- **exposeCoreTools**: Include patterns for internal MCP Funnel tools (optional, defaults to all enabled)
- **enableDynamicDiscovery**: Enable experimental dynamic tool discovery (default: false)
- **hackyDiscovery**: Enable minimal context mode with dynamic tool bridging (default: false)

### Filtering Patterns

Patterns match against the prefixed tool names (`serverName__toolName`) and support wildcards (`*`):

**Individual tools:**

- `github__get_team_members` - Hide specific tool from GitHub server
- `memory__check_database_health` - Hide specific tool from Memory server

**Wildcard patterns:**

- `memory__dashboard_*` - All dashboard tools from Memory server
- `github__debug_*` - All debug tools from GitHub server
- `*__workflow_*` - All workflow-related tools from any server
- `memory__ingest_*` - All ingestion tools from Memory server
- `*__list_*` - All list tools from any server

**Common filtering examples:**

```json
"hideTools": [
  "memory__dashboard_*",         // Hide all dashboard tools from Memory
  "memory__debug_*",            // Hide all debug tools from Memory
  "memory__ingest_*",           // Hide ingestion tools from Memory
  "github__get_team_members",   // Hide specific GitHub tool
  "github__*_workflow_*",       // Hide workflow tools from GitHub
  "*__list_*_artifacts"         // Hide artifact listing tools from all servers
]
```

**Note:** Always use the server prefix (e.g., `github__`, `memory__`) to target specific servers' tools. Use `*__` at the beginning to match tools from any server.

### Core Tool Filtering

MCP Funnel includes internal tools for discovery and bridging. Control which core tools are exposed using `exposeCoreTools`:

```json
"exposeCoreTools": ["discover_*", "load_toolset"]  // Only expose discovery tools and toolset loading
```

Available core tools:

- `discover_tools_by_words` - Search for tools by keywords
- `get_tool_schema` - Get input schema for tools
- `bridge_tool_request` - Execute tools dynamically
- `load_toolset` - Load predefined tool patterns

If `exposeCoreTools` is not specified, all core tools are enabled by default.

## 📦 Built-in Commands

MCP Funnel includes several built-in commands that provide useful functionality:

### NPM Command

The NPM command provides package lookup and search capabilities using the NPM registry API.

**Tools exposed:**
- `npm_lookup` - Get detailed information about a specific NPM package
- `npm_search` - Search for packages matching a query

**Configuration:**
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

**Example usage:**
```bash
# CLI usage
npx mcp-funnel run npm lookup express
npx mcp-funnel run npm search "test framework"

# MCP usage (via Claude or other clients)
# "Look up the express package for me"
# "Search for TypeScript testing frameworks"
```

**Features:**
- Comprehensive package metadata including dependencies and statistics
- Smart search with relevance scoring
- Built-in caching (5 minutes) for improved performance
- Error handling for missing packages and network issues

For detailed documentation, see [NPM Command README](packages/commands/npm-lookup/README.md).

### Multi-Tool Commands

Commands can expose multiple tools, as demonstrated by the NPM command. This pattern allows:

- **Logical grouping**: Related functionality under one command
- **Shared resources**: Common caching, configuration, and error handling
- **Flexible filtering**: Enable/disable individual tools within a command

When creating custom commands, consider the multi-tool pattern for:
- API clients (list, get, create, update operations)
- File operations (read, write, search, validate)
- Development tools (lint, test, build, deploy)

## 🚀 Usage

### With Claude Code CLI

Add to your configuration (e.g. `path/to/your/project/.mcp.json`):

```json
{
  "mcpServers": {
    "mcp-funnel": {
      "command": "npx",
      "args": ["mcp-funnel"]
    }
  }
}
```

This will use `.mcp-funnel.json` from your current working directory. To use a custom config path:

```json
{
  "mcpServers": {
    "mcp-funnel": {
      "command": "npx",
      "args": ["mcp-funnel", "/path/to/your/.mcp-funnel.json"]
    }
  }
}
```

### With Google Gemini

Add to your configuration (e.g. `path/to/your/project/.gemini/settings.json`):

```json
{
  "mcpServers": {
    "mcp-funnel": {
      "command": "npx",
      "args": ["mcp-funnel"]
    }
  }
}
```

### With Codex CLI

Add to your configuration (e.g. `~/.codex/config.toml`):

```toml
[mcp_servers.mcp-funnel]
command = "npx"
args = ["mcp-funnel"]
```

### Example Prompts

Once configured, you can use natural language to interact with your aggregated tools:

```
"Load PRs for https://github.com/chris-schra/mcp-funnel"
```

This works seamlessly because MCP Funnel aggregates your GitHub server's tools with proper namespacing!

### Local Development

```bash
# Run from source (uses .mcp-funnel.json from current directory)
yarn dev

# Or build and test locally
yarn build
node dist/cli.js  # Uses .mcp-funnel.json from current directory
node dist/cli.js /path/to/custom-config.json  # Explicit config
```

### Development Scripts

```bash
yarn dev            # Run the development server with hot reload
yarn build          # Build the TypeScript code
yarn test           # Run all tests
yarn test:e2e       # Run end-to-end tests with mock servers
yarn validate       # Run comprehensive code quality checks (lint, typecheck, format)
yarn lint           # Run ESLint
yarn typecheck      # Run TypeScript type checking
yarn format         # Auto-format code with Prettier
```

## 🎮 Tool Visibility Control

MCP Funnel provides a three-tier visibility system for managing which tools are exposed:

### 1. Always Visible Tools (`alwaysVisibleTools`)

Tools matching these patterns are **always exposed from startup**, even when using dynamic discovery mode. Perfect for critical tools you always want available.

```json
{
  "alwaysVisibleTools": [
    "github__create_pull_request", // Always show this specific tool
    "memory__store_*" // Always show all store operations
  ],
  "enableDynamicDiscovery": true // Other tools hidden until discovered
}
```

### 2. Discoverable Tools (`exposeTools`)

When `enableDynamicDiscovery: true`, these tools are hidden initially but can be discovered and enabled dynamically. When discovery is disabled, they're visible from startup.

### 3. Hidden Tools (`hideTools`)

Tools matching these patterns are never exposed, regardless of other settings.

## 🚀 Hacky Discovery Mode (Ultra-Low Context)

Hacky Discovery is a workaround for Claude Code's lack of dynamic tool updates. When enabled (`hackyDiscovery: true`), MCP Funnel exposes only **3 tools** instead of 100+:

1. **discover_tools_by_words**: Search for tools by keywords
2. **get_tool_schema**: Get input schema for any tool
3. **bridge_tool_request**: Execute any tool dynamically

### How It Works

```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "your-token" }
    }
  },
  "hackyDiscovery": true
}
```

### Usage Examples

**Simple workflow:**

```
User: "Load PRs for https://github.com/chris-schra/mcp-funnel"
Claude: *Automatically discovers GitHub tools, gets schema, and executes via bridge*
```

**Step-by-step workflow:**

```
1. "Find tools for working with files"
   → Claude uses discover_tools_by_words
   → Returns: filesystem__read_file, filesystem__write_file, etc.

2. "Get the schema for filesystem__read_file"
   → Claude uses get_tool_schema
   → Returns: Input parameters and types

3. "Read the README.md file"
   → Claude uses bridge_tool_request
   → Executes: {"tool": "filesystem__read_file", "arguments": {"path": "README.md"}}
```

### Benefits

- **Full functionality**: All tools remain accessible
- **Smart discovery**: Claude can find and use tools naturally
- **Works today**: No waiting for Claude Code updates

### Trade-offs

- Less discoverable (tools aren't visible upfront)
- Slight overhead for discovery/schema steps
- Best for scenarios where you use <10% of available tools

## 🔍 Dynamic Tool Discovery (Experimental)

MCP Funnel includes a `discover_tools_by_words` tool that allows searching for tools by keywords. However, **this feature currently has limited utility**:

### ⚠️ Current Limitations

**Claude Code CLI does not support dynamic tool updates**. Once a session starts, the tool list is fixed. This means:

- The `discover_tools_by_words` tool can find matching tools
- It can "enable" them in MCP Funnel's internal state
- But Claude won't see newly enabled tools until you restart the session

We're eagerly waiting for these issues to be resolved:

- [claude-code#7519](https://github.com/anthropics/claude-code/issues/7519) - Dynamic tool discovery support
- [claude-code#4118](https://github.com/anthropics/claude-code/issues/4118) - Runtime tool updates

Once these features land, dynamic discovery will significantly reduce initial context usage by loading only the tools you need on-demand.

### Future Vision

When dynamic updates are supported, you'll be able to:

```
User: "I need to work with GitHub issues"
Assistant: *discovers and enables only GitHub issue tools*
User: "Now let's store some information"
Assistant: *discovers and enables only memory storage tools*
```

This will dramatically reduce context usage compared to loading 100+ tools upfront.

## 💡 Why Use MCP Funnel?

### The Context Problem

A typical MCP setup might expose:

- GitHub MCP: ~130 tools
- Memory MCP: ~30 tools
- Filesystem MCP: ~15 tools
- **Total: 175+ tools consuming 60-70k tokens**

Many of these tools are rarely used:

- Workflow management tools
- Team/organization tools
- Debug and diagnostic tools
- Dashboard interfaces
- Advanced embedding operations

### The MCP Funnel Solution

With MCP Funnel, you can:

1. **Connect multiple servers**: Use GitHub + Memory + Filesystem simultaneously
2. **Filter out noise**: Hide tools you never use
3. **Save context**: Reduce tool context from 70k to 30-40k tokens
4. **Maintain control**: Unlike server-side filtering (which most don't support), you control exactly what's exposed

## 🏗️ Architecture

```
┌────────────────────────┐
│ CLI (e.g. Claude Code) │
└──────┬─────────────────┘
       │ MCP Protocol via stdio
┌──────▼──────┐
│  MCP Funnel │ ← Filtering happens here
└──────┬──────┘
       │
   ┌───┴──────┬─────────┬─────────┐
   │          │         │         │
┌──▼────┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│GitHub │ │Memory │ │FS     │ │ ...   │ ← Each exposes all tools
└───────┘ └───────┘ └───────┘ └───────┘
```

MCP Funnel:

1. Connects to multiple MCP servers as a client
2. Receives all tools from each server
3. Applies your filtering rules
4. Exposes only the filtered tools to Claude
5. Routes tool calls to the appropriate backend server

## 🐛 Troubleshooting

### Server Connection Issues

MCP Funnel prefixes each server's stderr output for debugging:

```
[github] Connecting to GitHub API...
[memory] Database initialized at ~/.mcp-memory
[filesystem] Watching directory: /Users/example
```

### Common Issues

1. **Tool not found**: Check that the tool isn't filtered by `hideTools` patterns
2. **Server fails to start**: Check the command and args in your config
3. **Permission denied**: Ensure MCP Funnel has permission to execute server commands
4. **Environment variables**: Use the `env` field in server config for API keys

## 🔒 Security Considerations

- **Never commit API keys**: Use environment variables or `.env` files (git-ignored)
- **Filesystem access**: Be careful with filesystem server paths
- **Docker permissions**: Ensure proper Docker socket access if using containerized servers
- **Network isolation**: Consider running in isolated environments for sensitive operations

## 🗺️ Roadmap

- [ ] Connection retry logic for resilient server management
- [ ] Health monitoring and status reporting
- [ ] Graceful degradation when servers fail
- [ ] Structured logging with configurable levels
- [ ] Metrics and performance monitoring
- [ ] WebSocket transport support
- [ ] Full dynamic tool discovery (blocked on Claude Code CLI support)

## 🧪 Testing

Run the test suite:

```bash
yarn test           # Run all tests
yarn test:e2e       # Run end-to-end tests
yarn validate       # Run linting, type checking, and formatting checks
```

The project includes comprehensive e2e tests simulating Claude SDK conversations with mock MCP servers.

## 🤝 Contributing

Contributions are welcome! Key areas needing work:

1. **Error handling**: Make MCP Funnel resilient to server failures
2. **Testing**: Add comprehensive test coverage
3. **Logging**: Implement structured logging
4. **Build pipeline**: Set up proper TypeScript compilation and packaging

## 📄 License

MIT - See LICENSE file in the repository root

## 🙏 Acknowledgments

Built on top of the [Model Context Protocol SDK](https://github.com/anthropics/mcp) by Anthropic.

---

**Note**: This is an experimental tool in active development. Production use should include proper error handling and monitoring.
