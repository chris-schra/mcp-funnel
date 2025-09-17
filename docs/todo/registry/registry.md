<!-- markdown-link-check-disable -->

# MCP Registry Integration - MVP Design

## User Experience Flow

**Current flow:**

```
User: "discover tool code-reasoning"
Claude: *searches locally loaded servers* → "No tools found"
```

**Enhanced flow with registries:**

```
User: "discover tool code-reasoning"
Claude: *searches locally* → "No local tools found"
Claude: *automatically searches registries* → "Found code-reasoning in MCP registry!"
Claude: "Use get_server_install_info to see how to add it to your config"
```

## Real API Endpoints

The official MCP Registry is live with the following endpoints:

- **Production base URL**: `https://registry.modelcontextprotocol.io`
- **API version**: `/v0`
- **Search endpoint**: `/v0/servers?search={keywords}`

### Example Search URLs

- `https://registry.modelcontextprotocol.io/v0/servers?search=test`
- `https://registry.modelcontextprotocol.io/v0/servers?search=mcp-funnel`
- `https://registry.modelcontextprotocol.io/v0/servers?search=github`

### API Documentation References

- **Full API docs**: https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md
- **Live API docs**: https://registry.modelcontextprotocol.io/docs
- **OpenAPI spec**: https://registry.modelcontextprotocol.io/openapi.yaml

### Key API Findings

- The API uses `/v0/servers?search={keywords}` for searching
- Response format includes `servers` array and `metadata` with count and pagination
- No individual server endpoint - all data comes from search
- Supports pagination with `cursor` and `limit` parameters
- Multiple registries can be configured in the config

## Configuration

```jsonc
{
  "servers": [
    // Your existing static servers
  ],
  "registries": [
    "https://registry.modelcontextprotocol.io",
    "https://company.internal/mcp-registry",
  ],
  "registrySettings": {
    "autoSearch": true, // Auto-search registries when local search fails
  },
}
```

## Core Tools

### Tool 1: `search_registry_tools`

Lightweight discovery - searches registries for servers matching keywords.

```typescript
export class SearchRegistryTools extends BaseCoreTool {
  name = 'search_registry_tools';

  description = 'Search MCP registries for servers providing specific tools';

  inputSchema = {
    type: 'object',
    properties: {
      keywords: {
        type: 'string',
        description: 'Space-separated keywords to search for',
      },
      registry: {
        type: 'string',
        description:
          'Specific registry URL (optional, searches all by default)',
      },
    },
    required: ['keywords'],
  };

  async execute(input: { keywords: string; registry?: string }) {
    const matches = await this.searchRegistries(input.keywords, input.registry);

    if (matches.length === 0) {
      return {
        found: false,
        message: `No servers matching "${input.keywords}" found in registries`,
      };
    }

    // Minimal output to avoid token bloat
    return {
      found: true,
      servers: matches.map((server) => ({
        name: server.name,
        description: server.description,
        registryId: server.id,
        isRemote: !!server.remotes?.length,
        registryType: server.registry_type, // npm, pypi, oci, github
      })),
      message: `Found ${matches.length} servers. Use get_server_install_info for installation details.`,
    };
  }
}
```

### Tool 2: `get_server_install_info`

Get detailed installation instructions for a specific server.

```typescript
export class GetServerInstallInfo extends BaseCoreTool {
  name = 'get_server_install_info';

  description =
    'Get installation instructions and config for a specific registry server';

  inputSchema = {
    type: 'object',
    properties: {
      registryId: {
        type: 'string',
        description: 'Registry ID of the server',
      },
    },
    required: ['registryId'],
  };

  async execute(input: { registryId: string }) {
    const server = await this.registryClient.getServer(input.registryId);

    // Generate appropriate config based on registry type
    const configSnippet = this.generateConfigSnippet(server);
    const instructions = this.generateInstallInstructions(server);

    return {
      name: server.name,
      description: server.description,
      configSnippet, // Ready to paste into .mcp-funnel.json
      installInstructions: instructions,
      tools: server.tools || [], // If available in metadata
    };
  }
}
```

## Integration with Existing Discovery

Update `discover_tools_by_words` to suggest registry search:

```typescript
class DiscoverToolsByWords {
  async execute(input: { words: string }) {
    const results = this.searchLocalTools(input.words);

    if (results.length === 0 && this.context.hasRegistries()) {
      return {
        tools: [],
        message: 'No local tools found',
        suggestion: `Try searching registries: search_registry_tools "${input.words}"`,
      };
    }

    return { tools: results };
  }
}
```

## Registry Client Implementation

Simple client without caching for MVP, using the real API endpoints:

```typescript
export class MCPRegistryClient {
  private readonly baseUrl: string;

  constructor(registryUrl: string) {
    // Remove trailing slash and ensure no /v0 suffix since we'll add it
    this.baseUrl = registryUrl.replace(/\/+$/, '');
  }

  async searchServers(
    keywords: string,
    cursor?: string,
    limit?: number,
  ): Promise<RegistrySearchResponse> {
    const params = new URLSearchParams({ search: keywords });
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', limit.toString());

    const response = await fetch(`${this.baseUrl}/v0/servers?${params}`);
    if (!response.ok) {
      throw new Error(`Registry error: ${response.status}`);
    }
    return response.json();
  }

  // Note: No individual server endpoint exists in the real API
  // All server data comes from the search endpoint
  async getServer(id: string): Promise<ServerDetail | null> {
    // Search for the specific server by ID or name
    const results = await this.searchServers(id);
    return (
      results.servers.find(
        (server) => server.id === id || server.name === id,
      ) || null
    );
  }
}

interface RegistrySearchResponse {
  servers: ServerDetail[];
  metadata: {
    count: number;
    cursor?: string;
    has_more?: boolean;
  };
}
```

## Config Generation

Generate config snippets matching user's .mcp-funnel.json format:

```typescript
interface RegistryConfigEntry {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: string;
  url?: string;
  headers?: Record<string, string>;
  _registry_metadata?: ServerDetail;
}

function generateConfigSnippet(server: ServerDetail): RegistryConfigEntry {
  const entry: RegistryConfigEntry = {
    name: server.name,
  };

  // Handle remote servers (cloud-based)
  if (server.remotes && server.remotes.length > 0) {
    const remote = server.remotes[0];
    entry.transport = remote.type;
    entry.url = remote.url;
    if (remote.headers) {
      entry.headers = remote.headers;
    }
    return entry;
  }

  // Handle package-based servers
  if (server.packages && server.packages.length > 0) {
    const pkg = server.packages[0];

    switch (pkg.registry_type) {
      case 'npm':
        entry.command = pkg.runtime_hint || 'npx';
        entry.args = ['-y', pkg.identifier, ...(pkg.package_arguments || [])];
        break;

      case 'oci':
        entry.command = pkg.runtime_hint || 'docker';
        entry.args = ['run', '-i', '--rm', pkg.identifier];
        break;

      case 'pypi':
        entry.command = pkg.runtime_hint || 'uvx';
        entry.args = [pkg.identifier, ...(pkg.package_arguments || [])];
        break;

      default:
        // Return raw metadata if we can't determine command
        return {
          name: server.name,
          _registry_metadata: server, // Let user figure it out
        };
    }

    // Convert environment variables from array to object
    if (pkg.environment_variables) {
      entry.env = {};
      for (const envVar of pkg.environment_variables) {
        entry.env[envVar.name] = envVar.value || '';
      }
    }
  }

  return entry;
}
```

## User Experience Examples

**Scenario 1: Discover and install**

```
User: "I need SQL tools"
Claude: search_registry_tools("sql")
Returns: "Found 3 servers: sqlite-mcp, postgres-tools, mysql-connector"

User: "Tell me about sqlite-mcp"
Claude: get_server_install_info("sqlite-mcp-id")
Returns: Config snippet and instructions

User: [Manually adds to .mcp-funnel.json and restarts]
```

**Scenario 2: Guided discovery**

```
User: "discover tool python formatter"
Claude: discover_tools_by_words("python formatter")
Returns: "No local tools. Try: search_registry_tools"

Claude: search_registry_tools("python formatter")
Returns: "Found black-mcp, ruff-formatter"

Claude: "Would you like installation details for any of these?"
```

## Benefits of MVP Approach

1. **Simple and focused**: Just discovery and installation guidance
2. **No state management**: No temporary servers to track
3. **Token efficient**: Minimal output, details on demand
4. **Safe**: No automatic modifications to user config
5. **Clear mental model**: Registry → Discover → Install manually

## Implementation Priority

1. Registry client (basic fetch operations)
2. `search_registry_tools` tool
3. `get_server_install_info` tool
4. Update `discover_tools_by_words` to suggest registry
5. Config generation logic

See [registry_phase2.md](./registry_phase2.md) for future enhancements including temporary servers, caching, and server management.
