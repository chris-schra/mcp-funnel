
## 🔐 Secret Management

MCP Funnel includes a comprehensive secret management system designed to securely handle environment variables and sensitive configuration for MCP servers. This system replaces the insecure practice of passing all process environment variables directly to child processes.

### Quick Start Example

Here's the simplest way to set up GitHub MCP with secure token handling:

**Step 1: Create `.env` file:**
```env
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_github_token_here
```

**Step 2: Configure `.mcp-funnel.json`:**
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

**That's it!** Your GitHub token is:
- ✅ Loaded securely from `.env`
- ✅ Never exposed in configuration files
- ✅ Automatically injected when needed
- ✅ Kept out of version control (add `.env` to `.gitignore`)

### Why Secret Management Matters

By default, many MCP server configurations simply pass through the entire process environment (`process.env`) to child servers. This approach has several security concerns:

- **Over-exposure**: Servers receive environment variables they don't need
- **Credential leakage**: Sensitive tokens intended for other services may be exposed
- **Attack surface**: Each server has access to more credentials than necessary

MCP Funnel's secret provider architecture follows the principle of least privilege, ensuring each server only receives the environment variables it actually needs.

### Architecture Overview

The secret management system is built around a modular provider architecture:

```
┌───────────────────────┐
│  Configuration        │
│  secretProviders: [   │
│    { type: "dotenv" } │
│    { type: "process"} │
│    { type: "inline"}  │
│  ]                    │
└──────────┬────────────┘
           │
    ┌──────▼────────┐
    │ SecretManager │ ← Orchestrates providers, handles precedence
    └──────┬────────┘
           │
   ┌───────┴────┬───────────┬─────────┐
   │            │           │         │
┌──▼─────┐ ┌────▼────┐ ┌────▼────┐    │
│DotEnv  │ │Process  │ │Inline   │    │ ← Each provider resolves from its source
│Provider│ │Provider │ │Provider │    │
└────────┘ └─────────┘ └─────────┘    │
     │          │           │         │
     ▼          ▼           ▼         ▼
┌───────────────────────────────────────┐
│    Merged Environment                 │ ← Later providers override earlier ones
│  { API_KEY: "...",                    │
│    NODE_ENV: "production" }           │
└───────────────────────────────────────┘
```

### Available Provider Types

MCP Funnel supports three types of secret providers:

#### 1. DotEnv Provider (`type: "dotenv"`)

Loads secrets from `.env` files on the filesystem. This is the most common approach for managing API tokens and other sensitive configuration.

**Configuration:**

- `path`: Path to the .env file (relative to config file or absolute)
- `encoding`: File encoding (default: 'utf-8')

**Use cases:**

- GitHub tokens, database URLs, API keys
- Environment-specific configuration (`.env.development`, `.env.production`)
- Keeping secrets out of version control

#### 2. Process Environment Provider (`type: "process"`)

Filters and forwards environment variables from the current process. Provides fine-grained control over which variables are passed through.

**Configuration:**

- `prefix`: Include only variables starting with this prefix (prefix is stripped)
- `allowlist`: Explicit list of variable names to include
- `blocklist`: Explicit list of variable names to exclude

**Use cases:**

- CI/CD environments where secrets are injected as environment variables
- Filtering system variables vs application variables
- Namespace-based organization (e.g., `MCP_API_KEY`)

#### 3. Inline Provider (`type: "inline"`)

Provides static key-value pairs directly in the configuration. **Use with caution** as values are stored in plain text.

**Configuration:**

- `values`: Object with key-value pairs of secrets

**Use cases:**

- Non-sensitive static configuration
- Default/fallback values
- Testing and development

### Provider Precedence

When multiple providers are configured, they are processed in order with **later providers overriding earlier ones**:

```json
{
  "secretProviders": [
    { "type": "dotenv", "config": { "path": ".env" } }, // Applied first
    { "type": "process", "config": { "prefix": "MCP_" } }, // Overrides .env values
    { "type": "inline", "config": { "values": { "DEBUG": "1" } } } // Final override
  ]
}
```

This precedence system allows for flexible configuration hierarchies (e.g., defaults from .env, overrides from environment, final tweaks from inline).

### Default Passthrough Environment Variables

For operational compatibility, MCP Funnel includes a minimal set of environment variables that are always passed through to servers:

- `NODE_ENV`: Application environment (development, production, etc.)
- `HOME`: User's home directory
- `USER`: Current user name
- `PATH`: System PATH for executable resolution
- `TERM`: Terminal type information
- `CI`: Continuous integration indicator
- `DEBUG`: Debug mode flags

These defaults balance security (not exposing unnecessary variables) with functionality (providing variables most servers need to operate).

### Customizing Default Passthrough Variables

You can override the default passthrough list using the `defaultPassthroughEnv` configuration:

```json
{
  "defaultPassthroughEnv": ["NODE_ENV", "PATH", "CUSTOM_VAR"],
  "servers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "my-server"]
    }
  }
}
```

**To disable all default passthrough variables**, set an empty array:

```json
{
  "defaultPassthroughEnv": []
}
```

This provides complete control over which environment variables are exposed to MCP servers.

### Configuration Examples

MCP Funnel's secret provider system allows you to securely manage environment variables and API tokens for your MCP servers. Here are practical examples for different scenarios:

#### Basic Setup with Multiple Servers

Here's a real-world configuration showing how simple it is to manage secrets for multiple servers:

**.env file:**
```env
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_github_token_here
CONTEXT7_API_KEY=ctx7sk_your_key_here
```

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
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp", "--api-key", "${CONTEXT7_API_KEY}"],
      "secretProviders": [
        { "type": "dotenv", "config": { "path": ".env" } }
      ]
    }
  }
}
```

**Key points:**
- Both servers read from the same `.env` file
- Tokens are interpolated using `${VARIABLE_NAME}` syntax
- Each server only gets the variables it needs
- No secrets in your config files

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

This configuration will pass through environment variables like `MCP_API_KEY`, `MCP_DATABASE_URL`, etc., while filtering out system variables for better security. If you combine a prefix with an `allowlist`, make sure the allowlist entries include the full environment variable names (for example `MCP_API_KEY`), because the filtering occurs before the prefix is stripped.

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
        {
          "type": "inline",
          "config": {
            "values": { "API_KEY": "static-value" }
          }
        }
      ]
    }
  }
}
```

This setup:

1. Loads secrets from `.env` file first
2. Adds specific process environment variables
3. Overrides with inline values (useful for non-sensitive static configuration)

#### Simplified Global Configuration

For even simpler configuration, use default providers that apply to all servers:

```json
{
  "defaultSecretProviders": [
    { "type": "dotenv", "config": { "path": ".env" } }
  ],
  "servers": {
    "github": {
      "transport": {
        "type": "streamable-http",
        "url": "https://api.githubcopilot.com/mcp/"
      },
      "auth": {
        "type": "bearer",
        "token": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp", "--api-key", "${CONTEXT7_API_KEY}"]
    }
  }
}
```

**Notice:** No `secretProviders` on individual servers - they all inherit from `defaultSecretProviders`!

In this configuration:

- All servers inherit the default `.env` file loading
- Common system variables (`NODE_ENV`, `HOME`, `PATH`) are passed to all servers
- The memory server adds additional prefix-based filtering, combining with the defaults
- Individual servers can override defaults by specifying their own `secretProviders`

### Migrating from env to secretProviders

The legacy `env` field is still supported for backward compatibility, but the new `secretProviders` system provides better security by giving you control over which environment variables are exposed to each server.

#### Before (legacy approach - exposes all environment variables)

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
    }
  }
}
```

#### After (secure approach - controlled environment exposure)

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

#### Migration Steps

1. **Create a .env file** with your secrets (if you don't already have one):

   ```bash
   GITHUB_TOKEN=your_github_token_here
   API_KEY=your_api_key_here
   ```

2. **Add secretProviders configuration** to your server config:

   ```json
   "secretProviders": [
     { "type": "dotenv", "config": { "path": ".env" } }
   ]
   ```

3. **Remove the hardcoded env field** from your server configuration

4. **Test that your server still works** by running MCP Funnel and verifying the server connects successfully

#### Benefits of Migration

- **Better security**: Only specified environment variables are exposed to each server
- **Cleaner configuration**: No need for Docker wrapper containers just to pass environment variables
- **No secret exposure**: Environment variables are loaded securely without being visible in process lists
- **Simplified setup**: Direct execution of npm packages without Docker overhead

**Note**: If you were using Docker primarily to pass environment variables, you can now run servers directly using `npx` with the `secretProviders` configuration, eliminating the need for Docker in many cases.
