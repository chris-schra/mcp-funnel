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

## 🔧 Installation

### Installing Custom Commands

MCP Funnel supports dynamically installing additional commands from npm packages. You can install commands globally to your user directory (~/.mcp-funnel/packages) where they'll be available across all your projects.

#### Using the `manage_commands` tool

`manage_commands` is a built-in MCP Funnel tool that installs, updates, and removes command packages without requiring a separate CLI wrapper. The tool is exposed by default as long as `exposeCoreTools` is unset (or explicitly includes `manage_commands`).

Example install request through `bridge_tool_request` (Claude, Codex CLI, etc.):

```json
{
  "name": "manage_commands",
  "arguments": {
    "action": "install",
    "package": "@awesome-org/mcp-command",
    "version": "1.2.3"
  }
}
```

Supported payload fields:

- `action`: `install`, `update`, or `uninstall` (required).
- `package`: npm package spec or previously installed command name (required).
- `version`: optional version (install only) — e.g., `"1.2.3"`.
- `force`: boolean flag to reinstall even if already present (install only).
- `removeData`: boolean flag to delete cached data (uninstall only).

Responses include structured details about the command, any discovered tools, and whether a hot reload succeeded. When running inside an MCP client you can call the tool directly; no additional CLI plumbing is necessary.

#### Command Discovery

User-installed commands are automatically discovered from `~/.mcp-funnel/packages/node_modules/` and loaded alongside built-in commands. They respect your configuration:

- If `commands.list` is specified, only whitelisted commands are loaded
- Commands can be hidden using `hideTools` patterns
- Tools from commands are filtered by `exposeTools` patterns

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

### Passing secrets / environment variables example: GitHub MCP

Here's how simple it is to configure GitHub MCP with secure token handling:

**.mcp-funnel.json:**
```json
{
  "servers": {
    "github": {
      "transport": {
        "type": "streamable-http",
        "url": "https://api.githubcopilot.com/mcp/"
      },
      "auth": {
        "type": "bearer",
        "token": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      },
      "secretProviders": [
        { "type": "dotenv", "config": { "path": ".env" } }
      ]
    }
  }
}
```

**.env:**
```env
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_github_token_here
```

That's it! The `secretProviders` automatically loads your token from `.env`, keeping it secure and out of your config files.

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
- **Commands**: Command tools are exposed using their tool names directly (e.g., `npm_lookup`, `ts-validate`) or with wildcards (e.g., `npm_*`) in exposeTools/hideTools patterns.

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

### CLI Onboarding

Kick off the guided migration flow to consolidate existing CLI configs:

```
npx mcp-funnel init
```

This command:

- Scans typical configuration files for Claude Code/Gemini (`.mcp.json`, `.gemini/settings.json`), Claude Desktop (`~/.claude.json`), and Codex (`~/.codex/config.toml`).
- Lists every MCP server it finds and lets you pick which ones should move into `.mcp-funnel.json`.
- Merges the selected servers into `.mcp-funnel.json`, creating the file with recommended defaults when needed.
- Rewrites each client config so that only a single `mcp-funnel` entry remains, pointing at the merged configuration.

Every write is gated behind an explicit confirmation, so you can review the proposed changes before they land.

### Example Prompts

Once configured, you can use natural language to interact with your aggregated tools:

```
"Load PRs for https://github.com/chris-schra/mcp-funnel"
```

This works seamlessly because MCP Funnel aggregates your GitHub server's tools with proper namespacing!

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

### 🔐 Secret Management

MCP Funnel includes a secure secret management system that follows the principle of least privilege. Instead of exposing all environment variables to MCP servers, you can use **secret providers** to control exactly which secrets each server receives.

**Quick example:**
```json
{
  "secretProviders": [
    { "type": "dotenv", "path": ".env" },      // Load from .env files
    { "type": "process", "prefix": "MCP_" },   // Filter env vars by prefix
    { "type": "inline", "values": { ... } }    // Define inline secrets
  ]
}
```

**Key benefits:**
- Minimal environment variable exposure to child processes
- Multiple provider types (dotenv, process, inline) with precedence rules
- Built-in security filtering to prevent credential leakage
- Centralized secret management across all your MCP servers

📖 **[See the complete Secret Management guide →](docs/secret-management.md)**

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

### 🛠️ Development

For local development setup, debugging, and testing:

📖 **[See the Development Guide →](docs/development.md)**

## 🤝 Contributing

Contributions are welcome! Key areas needing work:

1. **Error handling**: Make MCP Funnel resilient to server failures
2. **Testing**: Add comprehensive test coverage for other clients than Claude Code
3. **Logging**: Implement structured logging

## 📄 License

MIT - See LICENSE file in the repository root
