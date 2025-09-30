/**
 * Configuration for an MCP server connection.
 *
 * Supports both local (command-based) and remote (URL-based) server configurations.
 * @public
 */
export interface ServerConfig {
  /** Unique name identifier for the server */
  name: string;

  /** Command to execute for local servers (e.g., 'node', 'python') */
  command?: string;

  /** Arguments to pass to the command for local servers */
  args?: string[];

  /** Environment variables to set when spawning local servers */
  env?: Record<string, string>;

  /** Transport protocol for remote servers (e.g., 'http', 'websocket') */
  transport?: string;

  /** URL for remote server connections */
  url?: string;

  /** HTTP headers for remote server authentication and configuration */
  headers?: Record<string, string>;
}

/**
 * Interface for managing temporary MCP servers.
 *
 * Temporary servers are spawned on-demand and exist only for the duration
 * of a session or until explicitly disconnected. They can be converted
 * to persistent servers through the persist operation.
 *
 * **Phase 1**: MVP implementation focuses on tracking and basic lifecycle
 *
 * **Phase 2**: Will add full server lifecycle management, health monitoring,
 * and advanced configuration options
 * @public
 */
export interface ITemporaryServerManager {
  /**
   * Spawn a new temporary MCP server
   * @param config - Server configuration including command, args, and connection details
   * @returns Promise resolving to unique server identifier
   * @throws if server cannot be spawned or configuration is invalid
   */
  spawn(config: ServerConfig): Promise<string>;

  /**
   * Check if a server is managed as temporary
   * @param serverName - Name of the server to check
   * @returns true if server exists and is temporary, false otherwise
   */
  isTemporary(serverName: string): boolean;

  /**
   * Retrieve configuration for a temporary server
   * @param serverName - Name of the temporary server
   * @returns Server configuration if found, null if server doesn't exist or isn't temporary
   */
  getTemporary(serverName: string): ServerConfig | null;

  /**
   * List all currently active temporary server names
   * @returns Array of temporary server names
   */
  listTemporary(): string[];

  /**
   * Disconnect and remove a temporary server
   * @param serverName - Name of the server to disconnect
   * @returns Promise resolving when server is fully disconnected and cleaned up
   * @throws if server doesn't exist or disconnect fails
   */
  disconnect(serverName: string): Promise<void>;

  /**
   * Convert a temporary server to a persistent configuration
   *
   * This operation moves the server from temporary to persistent storage,
   * allowing it to be automatically reconnected in future sessions.
   * @param serverName - Name of the temporary server to persist
   * @returns Promise resolving to the persisted configuration, or null if server doesn't exist
   * @throws if persistence fails or server is already persistent
   */
  persist(serverName: string): Promise<ServerConfig | null>;
}
