# Registry Integration - Extensible MVP Implementation

## Architecture Philosophy

Build the MVP with proper abstractions and extension points so Phase 2 features can be added without refactoring.

## Core Abstractions with Extension Points

### 1. Cache Layer (MVP: No-op, Phase 2: Real caching)

```typescript
// src/registry/cache-interface.ts
export interface IRegistryCache {
  get(key: string): Promise<any | null>;
  set(key: string, value: any, ttlMs?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// src/registry/cache-noop.ts (MVP)
export class NoOpCache implements IRegistryCache {
  async get(key: string): Promise<any | null> {
    return null; // Always cache miss in MVP
  }

  async set(key: string, value: any, ttlMs?: number): Promise<void> {
    // No-op in MVP
  }

  async has(key: string): Promise<boolean> {
    return false; // Never has anything in MVP
  }

  async delete(key: string): Promise<void> {
    // No-op in MVP
  }

  async clear(): Promise<void> {
    // No-op in MVP
  }
}

// NOTE: THIS IS OUT OF SCOPE FOR MVP - DO NOT IMPLEMENT YET
// src/registry/cache-memory.ts (Phase 2)
export class MemoryCache implements IRegistryCache {
  private cache = new Map<string, CacheEntry>();
  // ... real implementation
}
```

### 2. Registry Client with Cache Hooks

```typescript
// src/registry/registry-client.ts
export class MCPRegistryClient {
  constructor(
    private readonly baseUrl: string,
    private readonly cache: IRegistryCache = new NoOpCache(),
  ) {}

  async searchServers(keywords: string): Promise<ServerDetail[]> {
    const cacheKey = `${this.baseUrl}:search:${keywords}`;

    // Extension point: Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from registry
    const response = await fetch(
      `${this.baseUrl}/search?q=${encodeURIComponent(keywords)}`,
    );
    if (!response.ok) {
      throw new Error(`Registry error: ${response.status}`);
    }

    const data = await response.json();

    // Extension point: Store in cache
    await this.cache.set(cacheKey, data.servers, 60 * 60 * 1000); // 1hr TTL

    return data.servers;
  }

  async getServer(id: string): Promise<RegistryServer> {
    const cacheKey = `${this.baseUrl}:server:${id}`;

    // Extension point: Check cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from registry
    const response = await fetch(`${this.baseUrl}/servers/${id}`);
    if (!response.ok) {
      throw new Error(`Server not found: ${id}`);
    }

    const server = await response.json();

    // Extension point: Store in cache
    await this.cache.set(cacheKey, server, 60 * 60 * 1000);

    return server;
  }
}
```

### 3. Temporary Server Manager (MVP: Tracking only, Phase 2: Full lifecycle)

```typescript
// src/registry/temporary-server-manager.ts
export interface ITemporaryServerManager {
  spawn(config: ServerConfig): Promise<string>; // Returns serverId
  isTemporary(serverName: string): boolean;
  getTemporary(serverName: string): ServerConfig | null;
  listTemporary(): string[];
  disconnect(serverName: string): Promise<void>;
  persist(serverName: string): Promise<ServerConfig | null>;
}

// MVP Implementation - just tracks, doesn't actually spawn
export class TemporaryServerTracker implements ITemporaryServerManager {
  private temporaryServers = new Map<string, ServerConfig>();

  async spawn(config: ServerConfig): Promise<string> {
    // MVP: Just track it, don't actually spawn
    this.temporaryServers.set(config.name, config);
    console.error(`[registry] Would spawn temporary server: ${config.name}`);
    return config.name;
  }

  isTemporary(serverName: string): boolean {
    return this.temporaryServers.has(serverName);
  }

  getTemporary(serverName: string): ServerConfig | null {
    return this.temporaryServers.get(serverName) || null;
  }

  listTemporary(): string[] {
    return Array.from(this.temporaryServers.keys());
  }

  async disconnect(serverName: string): Promise<void> {
    // MVP: Just remove from tracking
    this.temporaryServers.delete(serverName);
  }

  async persist(serverName: string): Promise<ServerConfig | null> {
    // MVP: Return config for manual addition
    return this.getTemporary(serverName);
  }
}

// Phase 2: Real implementation that spawns processes
export class TemporaryServerManager implements ITemporaryServerManager {
  // ... actually spawns and manages server processes
}
```

### 4. Config File Manager (MVP: Read-only, Phase 2: Read-write)

```typescript
// src/registry/config-manager.ts
export interface IConfigManager {
  readConfig(): Promise<ProxyConfig>;
  addServer(server: ServerConfig): Promise<void>;
  removeServer(serverName: string): Promise<void>;
  updateServer(
    serverName: string,
    updates: Partial<ServerConfig>,
  ): Promise<void>;
}

// MVP: Read-only implementation
export class ReadOnlyConfigManager implements IConfigManager {
  constructor(private configPath: string) {}

  async readConfig(): Promise<ProxyConfig> {
    const content = await fs.readFile(this.configPath, 'utf-8');
    return JSON.parse(content);
  }

  async addServer(server: ServerConfig): Promise<void> {
    // MVP: Just return the config to show user
    console.log(
      'Add this to your .mcp-funnel.json:',
      JSON.stringify(server, null, 2),
    );
  }

  async removeServer(serverName: string): Promise<void> {
    console.log(`Remove "${serverName}" from your .mcp-funnel.json`);
  }

  async updateServer(
    serverName: string,
    updates: Partial<ServerConfig>,
  ): Promise<void> {
    console.log(`Update "${serverName}" in your .mcp-funnel.json:`, updates);
  }
}

// Phase 2: Actually modifies config file
export class ConfigFileManager implements IConfigManager {
  // ... real file modification
}
```

### 5. Registry Context with All Extension Points (Singleton)

```typescript
// src/registry/registry-context.ts
export class RegistryContext {
  private static instance: RegistryContext | null = null;

  private cache: IRegistryCache;
  private tempServerManager: ITemporaryServerManager;
  private configManager: IConfigManager;
  private registryClients: Map<string, MCPRegistryClient>;

  private constructor(
    private config: ProxyConfig,
    options: {
      cache?: IRegistryCache;
      tempServerManager?: ITemporaryServerManager;
      configManager?: IConfigManager;
    } = {},
  ) {
    // MVP defaults: No-op implementations
    this.cache = options.cache || new NoOpCache();
    this.tempServerManager =
      options.tempServerManager || new TemporaryServerTracker();
    this.configManager =
      options.configManager || new ReadOnlyConfigManager(config.configPath);

    // Initialize registry clients
    this.registryClients = new Map();
    for (const registryUrl of config.registries || []) {
      this.registryClients.set(
        registryUrl,
        new MCPRegistryClient(registryUrl, this.cache),
      );
    }
  }

  static getInstance(config?: ProxyConfig, options?: any): RegistryContext {
    if (!RegistryContext.instance) {
      if (!config) {
        throw new Error(
          'RegistryContext must be initialized with config on first access',
        );
      }
      RegistryContext.instance = new RegistryContext(config, options);
    }
    return RegistryContext.instance;
  }

  static reset(): void {
    RegistryContext.instance = null;
  }

  // All operations go through these methods with extension points
  async searchServers(keywords: string): Promise<ServerDetail[]> {
    const results: ServerDetail[] = [];

    for (const client of this.registryClients.values()) {
      try {
        const servers = await client.searchServers(keywords);
        results.push(...servers);
      } catch (error) {
        // Log but don't fail entire search
        console.error(`Registry search error: ${error}`);
      }
    }

    return results;
  }

  async getServerDetails(registryId: string): Promise<RegistryServer | null> {
    // Try each registry
    for (const client of this.registryClients.values()) {
      try {
        return await client.getServer(registryId);
      } catch {
        // Try next registry
      }
    }
    return null;
  }

  // Extension point for temporary servers
  async enableTemporary(server: RegistryServer): Promise<void> {
    const config = this.generateServerConfig(server);
    await this.tempServerManager.spawn(config);
  }

  // Extension point for persistence
  async persistTemporary(serverName: string): Promise<void> {
    const config = await this.tempServerManager.persist(serverName);
    if (config) {
      await this.configManager.addServer(config);
    }
  }
}
```

## Tool Implementations Using Shared Registry Context

```typescript
// src/tools/search-registry-tools/index.ts
export class SearchRegistryTools extends BaseCoreTool {
  constructor(context: CoreToolContext) {
    super(context);
  }

  async execute(input: { keywords: string }) {
    // Use singleton - cache is shared across all tools
    const registryContext = RegistryContext.getInstance(this.context.config);
    const servers = await registryContext.searchServers(input.keywords);

    return {
      found: servers.length > 0,
      servers: servers.map((s) => ({
        name: s.name,
        description: s.description,
        registryId: s.id,
      })),
    };
  }
}

// src/tools/get-server-install-info/index.ts
export class GetServerInstallInfo extends BaseCoreTool {
  constructor(context: CoreToolContext) {
    super(context);
  }

  async execute(input: { registryId: string }) {
    // Use same singleton instance - shares cache with search tool
    const registryContext = RegistryContext.getInstance(this.context.config);
    const server = await registryContext.getServerDetails(input.registryId);

    if (!server) {
      return { error: 'Server not found' };
    }

    return {
      name: server.name,
      configSnippet: this.generateConfigSnippet(server),
      instructions: this.generateInstructions(server),
    };
  }
}
```

## Phase 2 Activation

To enable Phase 2 features, just swap implementations:

```typescript
// Phase 2: Enable caching
const registryContext = new RegistryContext(config, {
  cache: new MemoryCache(),
  tempServerManager: new TemporaryServerManager(),
  configManager: new ConfigFileManager(configPath),
});
```

## Benefits of This Approach

1. **Clean separation**: Interfaces define contracts, implementations can vary
2. **Easy testing**: Mock implementations for unit tests
3. **Gradual rollout**: Enable features one by one
4. **No refactoring**: Phase 2 just provides real implementations
5. **Feature flags**: Could even toggle between implementations at runtime

## File Structure

```
src/registry/
├── interfaces/
│   ├── cache.interface.ts
│   ├── temp-server.interface.ts
│   └── config.interface.ts
├── implementations/
│   ├── cache-noop.ts         (MVP)
│   ├── cache-memory.ts       (Phase 2)
│   ├── temp-server-tracker.ts (MVP)
│   ├── temp-server-manager.ts (Phase 2)
│   ├── config-readonly.ts     (MVP)
│   └── config-manager.ts      (Phase 2)
├── registry-client.ts
├── registry-context.ts
└── index.ts
```

This architecture ensures the MVP is clean but ready for growth!
