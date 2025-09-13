declare module 'mcp-funnel' {
  export interface MCPProxyConfigServer {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }

  export interface MCPProxyConfig {
    servers: MCPProxyConfigServer[];
    hideTools?: string[];
    exposeTools?: string[];
    enableDynamicDiscovery?: boolean;
    hackyDiscovery?: boolean;
  }

  export interface MCPToolDefinition {
    description?: string;
    inputSchema?: unknown;
  }

  export interface MCPClientLike {
    callTool(request: {
      name: string;
      arguments?: Record<string, unknown>;
    }): Promise<unknown>;
  }

  export interface MCPProxy {
    config: MCPProxyConfig;
    clients: Map<string, unknown>;
    toolDefinitionCache: Map<
      string,
      { serverName: string; tool: MCPToolDefinition }
    >;
    toolDescriptionCache: Map<
      string,
      { serverName: string; description: string }
    >;
    dynamicallyEnabledTools: Set<string>;
    toolMapping: Map<string, { client: MCPClientLike; originalName: string }>;
    server: { sendToolListChanged(): void };
    initialize(): Promise<void>;
  }
}
