import type {
  ITemporaryServerManager,
  ServerConfig,
} from '../interfaces/temp-server.interface.js';

/**
 * MVP implementation that tracks temporary servers without actually spawning them.
 *
 * This class provides a tracking-only implementation for Phase 1 of the temporary
 * server management feature. It maintains an in-memory registry of temporary server
 * configurations and logs what actions would be performed, but does not actually
 * spawn or manage server processes.
 *
 * In Phase 2, this will be replaced with real process management capabilities
 * including actual server spawning, health monitoring, and lifecycle management.
 */
export class TemporaryServerTracker implements ITemporaryServerManager {
  private temporaryServers = new Map<string, ServerConfig>();

  /**
   * Spawn a new temporary MCP server (tracking only)
   *
   * Stores the server configuration in memory and logs the action.
   * In Phase 2, this will actually spawn the server process.
   */
  public async spawn(config: ServerConfig): Promise<string> {
    this.temporaryServers.set(config.name, config);
    console.info(`[Registry] Would spawn temporary server: ${config.name}`);
    return config.name;
  }

  /**
   * Check if a server is managed as temporary
   */
  public isTemporary(serverName: string): boolean {
    return this.temporaryServers.has(serverName);
  }

  /**
   * Retrieve configuration for a temporary server
   */
  public getTemporary(serverName: string): ServerConfig | null {
    return this.temporaryServers.get(serverName) ?? null;
  }

  /**
   * List all currently tracked temporary server names
   */
  public listTemporary(): string[] {
    return Array.from(this.temporaryServers.keys());
  }

  /**
   * Disconnect and remove a temporary server (tracking only)
   *
   * Removes the server from the in-memory registry and logs the action.
   * In Phase 2, this will actually terminate the server process.
   */
  public async disconnect(serverName: string): Promise<void> {
    if (!this.temporaryServers.has(serverName)) {
      throw new Error(`Temporary server '${serverName}' not found`);
    }

    this.temporaryServers.delete(serverName);
    console.info(`[Registry] Would disconnect temporary server: ${serverName}`);
  }

  /**
   * Convert a temporary server to a persistent configuration
   *
   * Returns the server configuration for manual addition to the config file.
   * In Phase 2, this will integrate with the persistent configuration system.
   */
  public async persist(serverName: string): Promise<ServerConfig | null> {
    const config = this.temporaryServers.get(serverName);
    if (!config) {
      return null;
    }

    console.info(
      `[Registry] Would persist temporary server '${serverName}' to configuration`,
    );
    return config;
  }
}
