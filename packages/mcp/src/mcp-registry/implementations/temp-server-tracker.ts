import type {
  ITemporaryServerManager,
  ServerConfig,
} from '../interfaces/temp-server.interface.js';

/**
 * MVP implementation that tracks temporary servers without actually spawning them.
 *
 * Provides a tracking-only implementation for Phase 1 of the temporary server
 * management feature. Maintains an in-memory registry of temporary server
 * configurations and logs what actions would be performed, but does not actually
 * spawn or manage server processes.
 *
 * **Phase 2**: This will be replaced with real process management capabilities
 * including actual server spawning, health monitoring, and lifecycle management.
 * @example
 * ```typescript
 * const tracker = new TemporaryServerTracker();
 * const serverId = await tracker.spawn({ name: 'test-server', command: 'node' });
 * console.log(tracker.isTemporary('test-server')); // true
 * await tracker.disconnect('test-server'); // Removes from tracking
 * ```
 * @public
 */
export class TemporaryServerTracker implements ITemporaryServerManager {
  private temporaryServers = new Map<string, ServerConfig>();

  /**
   * [MVP SIMULATION] Stores server configuration in memory and logs the action.
   *
   * In Phase 2, this will actually spawn the server process.
   *
   * {@inheritDoc ITemporaryServerManager.spawn}
   */
  public async spawn(config: ServerConfig): Promise<string> {
    this.temporaryServers.set(config.name, config);
    console.info(`[Registry] Would spawn temporary server: ${config.name}`);
    return config.name;
  }

  /**
   * {@inheritDoc ITemporaryServerManager.isTemporary}
   */
  public isTemporary(serverName: string): boolean {
    return this.temporaryServers.has(serverName);
  }

  /**
   * {@inheritDoc ITemporaryServerManager.getTemporary}
   */
  public getTemporary(serverName: string): ServerConfig | null {
    return this.temporaryServers.get(serverName) ?? null;
  }

  /**
   * {@inheritDoc ITemporaryServerManager.listTemporary}
   */
  public listTemporary(): string[] {
    return Array.from(this.temporaryServers.keys());
  }

  /**
   * [MVP SIMULATION] Removes server from in-memory registry and logs the action.
   *
   * In Phase 2, this will actually terminate the server process.
   *
   * {@inheritDoc ITemporaryServerManager.disconnect}
   */
  public async disconnect(serverName: string): Promise<void> {
    if (!this.temporaryServers.has(serverName)) {
      throw new Error(`Temporary server '${serverName}' not found`);
    }

    this.temporaryServers.delete(serverName);
    console.info(`[Registry] Would disconnect temporary server: ${serverName}`);
  }

  /**
   * [MVP SIMULATION] Returns configuration for manual addition to config file.
   *
   * In Phase 2, this will integrate with the persistent configuration system.
   *
   * {@inheritDoc ITemporaryServerManager.persist}
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
