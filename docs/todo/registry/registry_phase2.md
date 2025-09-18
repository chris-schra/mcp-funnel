# MCP Registry Integration - Phase 2 Features

## Current Production Status (MVP/Phase 1)

### ✅ Production-Ready Features
- **Registry Search**: Full keyword search across server metadata
- **Server Details**: UUID and name-based retrieval
- **Config Generation**: All package types (npm, pypi, oci, remote)
- **Smart Routing**: Automatic UUID detection for optimal API usage
- **Error Handling**: Robust throw/catch architecture with graceful degradation
- **Registry Mapping**: User-friendly registry IDs ("official")
- **Runtime Flexibility**: Support for custom runtime commands and arguments
- **Environment Variables**: Full support with substitution syntax
- **Headers Support**: Arrays and objects for remote servers
- **Tool Integration**: search_registry_tools and get_server_install_info

### 🔄 Phase 2 Features (Below - Not Yet Implemented)

## Caching System

### Registry Response Caching
```typescript
interface RegistryCacheEntry {
  server: RegistryServer;
  fetchedAt: Date;
  ttl: number; // milliseconds
}

class MCPRegistryClient {
  private cache = new Map<string, RegistryCacheEntry>();
  private readonly defaultTtl = 1000 * 60 * 60; // 1 hour

  async getServer(id: string): Promise<RegistryServer> {
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.fetchedAt.getTime() < cached.ttl) {
      return cached.server;
    }
    // Fetch and cache...
  }
}
```

## Temporary Server Runtime System

When `allowRuntimeServers` is enabled in config:

### Tool: enable_temporary_server
```typescript
export class EnableTemporaryServer extends BaseCoreTool {
  name = 'enable_temporary_server';
  description = 'Temporarily enable a server from registry for this session only';

  async execute(input: { serverName: string; registryId: string }) {
    // 1. Fetch full server details from registry
    const server = await this.registryClient.getServer(input.registryId);

    // 2. Generate runtime config
    const config = this.generateRuntimeConfig(server);

    // 3. Spawn server temporarily
    await this.context.spawnTemporaryServer(config);

    // 4. Track for potential persistence
    this.context.trackTemporaryServer(input.serverName);

    return {
      enabled: true,
      temporary: true,
      message: `Server '${input.serverName}' is running temporarily. To keep it, add it to your config.`
    };
  }
}
```

### Tool: persist_temporary_server
```typescript
export class PersistTemporaryServer extends BaseCoreTool {
  name = 'persist_temporary_server';
  description = 'Add a temporarily running server to your permanent config';

  async execute(input: { serverName: string }) {
    const tempServer = this.context.getTemporaryServer(input.serverName);
    if (!tempServer) {
      return { error: `No temporary server '${input.serverName}' found` };
    }

    // Generate config entry
    const configEntry = {
      name: tempServer.name,
      command: tempServer.command,
      args: tempServer.args,
      env: tempServer.env
    };

    // Update config file
    await this.updateConfigFile(configEntry);

    return {
      persisted: true,
      message: `Added '${input.serverName}' to .mcp-funnel.json`,
      configEntry
    };
  }
}
```

## Server Management Tools

### Tool: disconnect_server
```typescript
export class DisconnectServer extends BaseCoreTool {
  name = 'disconnect_server';
  description = 'Disconnect a running server (session only, does not modify config)';

  async execute(input: { serverName: string }) {
    await this.context.disconnectServer(input.serverName);
    return {
      disconnected: true,
      message: `Server '${input.serverName}' disconnected for this session`
    };
  }
}
```

### Tool: uninstall_server
```typescript
export class UninstallServer extends BaseCoreTool {
  name = 'uninstall_server';
  description = 'Remove a server from config and disconnect it';

  async execute(input: { serverName: string }) {
    // 1. Disconnect if running
    await this.context.disconnectServer(input.serverName);

    // 2. Remove from config file
    await this.removeFromConfig(input.serverName);

    return {
      uninstalled: true,
      message: `Server '${input.serverName}' removed from config`
    };
  }
}
```

## Advanced Configuration

```json
{
  "registrySettings": {
    "autoSearch": true,
    "cacheMinutes": 60,                // Cache duration
    "allowRuntimeServers": true,       // Enable temporary servers
    "autoCleanupOnExit": true,         // Clean temp servers on exit
    "trackUsagePatterns": true         // Track which servers are used frequently
  }
}
```

## Usage Pattern Tracking

Track which temporary servers are used frequently and suggest adding them:

```typescript
interface UsagePattern {
  serverName: string;
  uses: number;
  lastUsed: Date;
  sessionCount: number;
}

// After 3+ uses across sessions:
"You've used 'sql-tools' in 3 sessions. Would you like to add it permanently?"
```

## Smart Cleanup

Automatically clean up:
- Temporary servers on session end
- Unused permanent servers (with confirmation)
- Stale cache entries
- Failed server processes

## Architectural Improvements (Implemented)

These improvements emerged during development and weren't in the original Phase 2 plan:

### Error Handling Pattern
- **Architecture**: Client throws → Context catches pattern
- **Benefit**: Maintains error visibility while preventing registry failure cascades
- **Implementation**: Try-catch in context layer aggregates errors from multiple registries

### UUID Detection and Smart Routing
```typescript
// Automatically detects UUIDs and uses direct GET endpoint
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
if (isUuid) {
  // Direct GET /v0/servers/{uuid}
} else {
  // Search API with name matching
}
```

### Runtime Arguments Schema Support
```typescript
// Three-tier argument system for full publisher control
interface Package {
  runtime_hint?: string;       // Which runtime (npx, node, yarn)
  runtime_arguments?: string[]; // Flags for runtime (-y, --no-install)
  package_arguments?: string[]; // Flags for package (--verbose)
}
```

### Registry ID Mapping
```typescript
// User-friendly registry names
RegistryContext.REGISTRY_ID_MAPPING = {
  'official': 'https://registry.modelcontextprotocol.io',
  // Future: 'community', 'private', etc.
};
```

## Future Considerations

1. **Registry Webhooks**: Subscribe to updates for installed servers
2. **Version Management**: Handle server updates/downgrades
3. **Dependency Resolution**: Install required dependencies automatically
4. **Conflict Resolution**: Handle tool name conflicts between servers
5. **Rollback Support**: Undo server installations/changes
6. **Offline Mode**: Cache and fallback for registry unavailability
7. **Registry Federation**: Support multiple registry sources simultaneously