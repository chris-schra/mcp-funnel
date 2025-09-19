# MCP Funnel

A Model Context Protocol (MCP) proxy server that aggregates multiple MCP servers into a single interface, enabling you to use tools from multiple sources simultaneously through Claude Desktop or Claude Code CLI.

## 🎯 Purpose

Most MCP servers expose all their tools with no filtering options, consuming valuable context space

MCP Funnel enables you to:

- Connect to multiple MCP servers simultaneously (GitHub, Memory, Filesystem, etc.)
- **Fine-grained tool filtering**: Hide specific tools that you don't need
- **Pattern-based filtering**: Use wildcards to hide entire categories of tools
- **Reduce context usage**: Significantly decrease token consumption by exposing only necessary tools

## 🏗️ Architecture

```
┌────────────────────────┐
│ CLI (e.g. Claude Code) │
└──────┬─────────────────┘
       │ MCP Protocol via stdio
┌──────▼──────┐
│  MCP Funnel │ ← Filtering and dynamic discovery happens here
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
4. Exposes only the filtered tools to clients
5. Routes tool calls to the appropriate backend server

## 🚀 Features

- **Multi-Server Aggregation**: Connect to any number of MCP servers
- **Tool Namespacing**: Automatic prefixing prevents naming conflicts (`github__create_issue`, `memory__store_memory`)
- **Flexible Filtering**: Show/hide tools using wildcard patterns
- **Granular Control**: Filter individual tools that servers don't allow you to disable
- **Context Optimization**: Reduce MCP tool context usage by 40-60% through selective filtering
- **Custom Transports**: Supports stdio-based MCP servers (Docker, NPX, local binaries)
- **Server Log Prefixing**: Clear identification of which server is logging what
- **Dynamic Tool Discovery**: Experimental feature for reducing initial context usage (see limitations)
- **Core Tools Mode**: Ultra-minimal context mode exposing only selected MCP Funnel tools with dynamic bridging (95%+ context reduction)

## 💡 Why Use MCP Funnel?

### The Context Problem

A typical MCP setup might expose:

- GitHub MCP: ~70 tools
- Memory MCP: ~30 tools
- Filesystem MCP: ~15 tools
- **Total: 115+ tools consuming 40k tokens**

Many of these tools are rarely used:

- Workflow management tools
- Team/organization tools
- Debug and diagnostic tools
- Dashboard interfaces
- Advanced embedding operations

Or to "speak" with chat:

### Before

<details>
    <summary>For this `.mcp.json` config</summary>
    {<br/>
    &nbsp;&nbsp;"mcpServers": {<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;"memory": {<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"command": "uv",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"args": ["--directory", "/Users/me/_mcp/mcp-memory-service", "run", "memory", "server"]<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;},<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;"context7": {<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"command": "npx",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"args": ["-y", "@upstash/context7-mcp", "--api-key", "API_KEY"]<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;},<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;"code-reasoning": {<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"command": "npx",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"args": ["-y", "@mettamatt/code-reasoning"]<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;},<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;"filesystem": {<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"command": "npx",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"args": [<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"-y",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"@modelcontextprotocol/server-filesystem",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"allowed/file/path"<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;},<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;"github": {<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"command": "docker",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"args": [<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"run",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"-i",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"--rm",<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ghcr.io/github/github-mcp-server"<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;],<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"secretProviders": [<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{ "type": "dotenv", "config": { "path": ".env" } }<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;}<br/>
    &nbsp;&nbsp;}<br/>
    }<br/>
```
</details>

```
> /context
  ⎿  ⛁ ⛀ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   Context Usage
     ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   claude-opus-4-1-20250805 • 42k/200k tokens (21%)
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ MCP tools: 25.4k tokens (12.7%)
     ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Messages: 96 tokens (0.0%)
```

### After

```
> /context
⎿  ⛁ ⛀ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀   Context Usage
⛀ ⛀ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   claude-opus-4-1-20250805 • 18k/200k tokens (9%)
⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ MCP tools: 2.4k tokens (1.2%)
⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Messages: 96 tokens (0.0%)
```

**Then use it:**

```
> discover tool for code reasoning

⏺ I'll help you discover the code reasoning tool.

⏺ mcp-funnel - discover_tools_by_words (MCP)(words: "reasoning", enable: false)
  ⎿  Found 1 tools:
     ○ code-reasoning__code-reasoning: 🧠 A detailed tool for dynamic and reflective problem-solving through sequential thinking.
     … +29 lines (ctrl+o to expand)

⏺ Found it! The code-reasoning__code-reasoning tool is available for detailed code analysis and reasoning. Let me enable it:

⏺ mcp-funnel - load_toolset (MCP)(tools: ["code-reasoning__code-reasoning"])
  ⎿  Loaded 1 tools matching specified patterns
⏺ The code reasoning tool is now enabled. It provides:
  - Dynamic problem-solving through sequential thinking
  - Ability to branch and explore alternatives
  - Revision capabilities to correct earlier thinking
  - Flexible thought progression that adapts as understanding deepens

  You can now use this tool for analyzing code logic, understanding complex implementations, and working through programming challenges step-by-step.
```

## 📋 Prerequisites

- Node.js 18+ and npm/yarn
- [tsx](https://github.com/privatenumber/tsx) for running TypeScript directly
- MCP servers you want to proxy (installed separately)

## 🔧 Installation

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
      "args": ["run", "-i", "--rm", "ghcr.io/github/github-mcp-server"],
      "secretProviders": [{ "type": "dotenv", "config": { "path": ".env" } }]
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
  ]
}
```

### Configuration Options

- **servers**: Record of MCP servers to connect to (server name as key)
  - Key: Server name (used as tool prefix)
  - `command`: Command to execute
  - `args`: Command arguments (optional)
  - `env`: Environment variables (optional, deprecated - use secretProviders instead)
  - `secretProviders`: Array of secret provider configurations for secure environment variable management (recommended)
- **defaultSecretProviders**: Default secret providers applied to all servers (optional)
- **defaultPassthroughEnv**: Environment variables passed to all servers by default (optional)
- **alwaysVisibleTools**: Patterns for tools that are always exposed, bypassing discovery mode (optional)
- **exposeTools**: Include patterns for external tools to expose (optional)
- **hideTools**: Exclude patterns for external tools to hide (optional)
- **exposeCoreTools**: Include patterns for internal MCP Funnel tools (optional, defaults to all enabled)

### alwaysVisibleTools vs exposeTools

- Use **exposeTools** alone when you want a tool visible at startup. No duplication in alwaysVisibleTools is needed for server-backed tools.
- Use **alwaysVisibleTools** when you want a server tool to bypass all gating (expose/hide, future pattern changes). It wins over hideTools. You do not need to repeat it in exposeTools.
- **Commands are special**: listing them requires exposeTools using commands\_\_…; alwaysVisibleTools does not apply to dev-command listing.

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

### Secret Provider Examples

MCP Funnel's secret provider system allows you to securely manage environment variables and API tokens for your MCP servers. Here are practical examples for different scenarios:

#### Using a .env File for GitHub Token

Store your GitHub token in a `.env` file and configure MCP Funnel to load it automatically:

```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "secretProviders": [{ "type": "dotenv", "config": { "path": ".env" } }]
    }
  }
}
```

Create a `.env` file in your project root:

```env
GITHUB_TOKEN=ghp_your_github_token_here
```

This approach keeps sensitive tokens out of your configuration files and allows easy per-environment management.

#### Filtering Process Environment Variables by Prefix

Load only environment variables that start with a specific prefix, useful for organizing MCP-specific configuration:

```json
{
  "servers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "my-mcp-server"],
      "secretProviders": [{ "type": "process", "config": { "prefix": "MCP_" } }]
    }
  }
}
```

This configuration will pass through environment variables like `MCP_API_KEY`, `MCP_DATABASE_URL`, etc., while filtering out system variables for better security.

#### Combining Multiple Secret Providers

Chain multiple providers for flexible secret management, with later providers taking precedence:

```json
{
  "servers": {
    "multi-source": {
      "command": "npx",
      "args": ["-y", "complex-server"],
      "secretProviders": [
        { "type": "dotenv", "config": { "path": ".env" } },
        { "type": "process", "config": { "allowlist": ["NODE_ENV", "DEBUG"] } },
        { "type": "inline", "config": { "API_KEY": "static-value" } }
      ]
    }
  }
}
```

This setup:

1. Loads secrets from `.env` file first
2. Adds specific process environment variables
3. Overrides with inline values (useful for non-sensitive static configuration)

#### Global Default Providers

Set up default secret providers that apply to all servers, with optional global passthrough variables:

```json
{
  "defaultSecretProviders": [
    { "type": "dotenv", "config": { "path": ".env" } }
  ],
  "defaultPassthroughEnv": ["NODE_ENV", "HOME", "PATH"],
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "secretProviders": [
        { "type": "process", "config": { "prefix": "MEMORY_" } }
      ]
    }
  }
}
```

In this configuration:

- All servers inherit the default `.env` file loading
- Common system variables (`NODE_ENV`, `HOME`, `PATH`) are passed to all servers
- The memory server adds additional prefix-based filtering, combining with the defaults
- Individual servers can override defaults by specifying their own `secretProviders`

## 🚀 Usage

### With Claude Code CLI

Add to your configuration (e.g. `path/to/your/project/.mcp.json`):

```json
{
  "mcpServers": {
    "mcp-funnel": {
      "command": "npx",
      "args": ["-y", "mcp-funnel"]
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
      "args": ["-y", "mcp-funnel", "/path/to/your/.mcp-funnel.json"]
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
      "args": ["-y", "mcp-funnel"]
    }
  }
}
```

### With Codex CLI

Add to your configuration (e.g. `~/.codex/config.toml`):

```toml
[mcp_servers.mcp-funnel]
command = "npx"
args = ["-y", "mcp-funnel"]
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

Tools matching these patterns are **always exposed from startup**, even when using the dynamic discovery pattern (empty allowlist). Perfect for critical tools you always want available.

```json
{
  "alwaysVisibleTools": [
    "github__create_pull_request", // Always show this specific tool
    "memory__store_*" // Always show all store operations
  ]
}
```

### 2. Discoverable Tools (`exposeTools`)

When using an empty allowlist (`exposeTools: []`), these tools are hidden initially but can be discovered and enabled dynamically via `load_toolset`. When allowlisted in `exposeTools`, they're visible from startup.

### 3. Hidden Tools (`hideTools`)

Tools matching these patterns are never exposed, regardless of other settings.

### Dynamic Discovery

To start with a minimal surface and enable tools on demand:

```json
{
  "exposeTools": [],
  "alwaysVisibleTools": [],
  "exposeCoreTools": [
    "discover_*",
    "get_tool_schema",
    "load_toolset",
    "bridge_tool_request"
  ]
}
```

Runtime flow:

- Search: `discover_tools_by_words` with keywords (e.g., "context7").
- Enable: `load_toolset` with explicit tool names or patterns (e.g., ["context7__resolve_library_id", "context7__get-library-docs"]).
- Call: Use the enabled tools normally.

## 🚀 Core Tools Mode (Ultra-Low Context)

Core Tools Mode allows you to expose only MCP Funnel's internal tools for dynamic discovery. When you set `exposeCoreTools` to a minimal set, MCP Funnel can expose as few as **3 tools** instead of 100+:

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
      "secretProviders": [{ "type": "dotenv", "config": { "path": ".env" } }]
    }
  },
  "exposeCoreTools": [
    "discover_tools_by_words",
    "get_tool_schema",
    "bridge_tool_request"
  ]
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

## 🔒 Security Considerations

### Secret Management Best Practices

- **Use secretProviders instead of hardcoded env**: The new secret provider system offers better security than hardcoding environment variables in configuration files
- **Never commit API keys**: Always use `.env` files (ensure they're git-ignored) or environment variables
- **Never log secret values**: MCP Funnel's secret provider system prevents accidental logging of sensitive values
- **Use .env files for local development**: Store secrets in `.env` files and ensure they're included in your `.gitignore`
- **Use process environment filtering in production**: Use prefix-based filtering (`"prefix": "MCP_"`) or allowlists to minimize environment variable exposure
- **Check file permissions on .env files**: Ensure `.env` files have restricted permissions (e.g., `chmod 600 .env`) to prevent unauthorized access
- **Benefits of secret providers**:
  - Minimal environment variable exposure to child processes
  - Controlled access to only required secrets
  - Prevention of accidental secret logging
  - Centralized secret management across multiple servers

### Infrastructure Security

- **Filesystem access**: Be careful with filesystem server paths
- **Docker permissions**: Ensure proper Docker socket access if using containerized servers
- **Network isolation**: Consider running in isolated environments for sensitive operations

## 🗺️ Roadmap

- [x] Connection retry logic for resilient server management
- [ ] Health monitoring and status reporting
- [x] Graceful degradation when servers fail
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
2. **Testing**: Add comprehensive test coverage for other clients than Claude Code
3. **Logging**: Implement structured logging

## 📄 License

MIT - See LICENSE file in the repository root

## 🙏 Acknowledgments

Built on top of the [Model Context Protocol SDK](https://github.com/anthropics/mcp) by Anthropic.
