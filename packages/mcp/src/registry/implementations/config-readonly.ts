import fs from 'fs/promises';
import type { IConfigManager } from '../interfaces/config.interface.js';
import type { ProxyConfig } from '../../config.js';
import type { ServerConfig } from '../interfaces/temp-server.interface.js';

/**
 * Read-only configuration manager for MVP registry system.
 *
 * This implementation provides the complete IConfigManager interface but only
 * performs actual file operations for reading. Write operations (add/remove/update)
 * are logged to the console to show what would happen in the full implementation.
 *
 * **Phase 1 MVP Behavior:**
 * - `readConfig()`: Actually reads and parses the configuration file
 * - `addServer()`: Logs the server configuration that would be added
 * - `removeServer()`: Logs the server name that would be removed
 * - `updateServer()`: Logs the updates that would be applied
 *
 * **Phase 2 Production:** This will be replaced with a full implementation
 * that actually modifies the configuration file with proper validation,
 * error handling, and atomic updates.
 *
 * This approach allows the registry search and server management flow to be
 * fully developed and tested in Phase 1 without persistence concerns, then
 * seamlessly upgraded to full persistence in Phase 2.
 */
export class ReadOnlyConfigManager implements IConfigManager {
  /**
   * Creates a new ReadOnlyConfigManager instance.
   *
   * @param configPath - Absolute path to the configuration file (.mcp-funnel.json)
   */
  constructor(private readonly configPath: string) {}

  /**
   * Reads and parses the current proxy configuration from the file system.
   *
   * This is the only method that performs actual file operations in the MVP.
   *
   * @returns Promise resolving to the current ProxyConfig
   * @throws Error if configuration file cannot be read or contains invalid JSON
   */
  async readConfig(): Promise<ProxyConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content) as ProxyConfig;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to read config from ${this.configPath}: ${error.message}`,
        );
      }
      throw new Error(
        `Failed to read config from ${this.configPath}: Unknown error`,
      );
    }
  }

  /**
   * [MVP SIMULATION] Logs the server configuration that would be added.
   *
   * In the full implementation, this would add the server to the configuration
   * file and validate that the name doesn't conflict with existing servers.
   *
   * @param server - The server configuration to add
   * @throws Error if server name conflicts with existing server (simulated validation)
   */
  async addServer(server: ServerConfig): Promise<void> {
    // Simulate basic validation by checking existing config
    try {
      const currentConfig = await this.readConfig();
      const serverExists = Array.isArray(currentConfig.servers)
        ? currentConfig.servers.some((s) => s.name === server.name)
        : server.name in currentConfig.servers;

      if (serverExists) {
        throw new Error(
          `Server with name '${server.name}' already exists in configuration`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw error; // Re-throw validation errors
      }
      // If we can't read config, just log the operation anyway
    }

    console.info(
      '[Registry] Would add server to config:',
      JSON.stringify(server, null, 2),
    );
    console.info(
      `[Registry] To persist, manually add to your ${this.configPath}`,
    );
  }

  /**
   * [MVP SIMULATION] Logs the server name that would be removed.
   *
   * In the full implementation, this would remove the server from the
   * configuration file and validate that the server exists.
   *
   * @param serverName - Name of the server to remove
   * @throws Error if server does not exist (simulated validation)
   */
  async removeServer(serverName: string): Promise<void> {
    // Simulate validation by checking if server exists
    try {
      const currentConfig = await this.readConfig();
      const serverExists = Array.isArray(currentConfig.servers)
        ? currentConfig.servers.some((s) => s.name === serverName)
        : serverName in currentConfig.servers;

      if (!serverExists) {
        throw new Error(
          `Server with name '${serverName}' does not exist in configuration`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        throw error; // Re-throw validation errors
      }
      // If we can't read config, just log the operation anyway
    }

    console.info(`[Registry] Would remove server '${serverName}' from config`);
    console.info(
      `[Registry] To persist, manually remove from your ${this.configPath}`,
    );
  }

  /**
   * [MVP SIMULATION] Logs the updates that would be applied to a server.
   *
   * In the full implementation, this would update the server configuration
   * in the file and validate that the server exists and updates are valid.
   *
   * @param serverName - Name of the server to update
   * @param updates - Partial server configuration with fields to update
   * @throws Error if server does not exist (simulated validation)
   * @throws Error if updates would create invalid configuration (simulated validation)
   */
  async updateServer(
    serverName: string,
    updates: Partial<ServerConfig>,
  ): Promise<void> {
    // Simulate validation by checking if server exists
    try {
      const currentConfig = await this.readConfig();
      const serverExists = Array.isArray(currentConfig.servers)
        ? currentConfig.servers.some((s) => s.name === serverName)
        : serverName in currentConfig.servers;

      if (!serverExists) {
        throw new Error(
          `Server with name '${serverName}' does not exist in configuration`,
        );
      }

      // Simulate validation: if trying to update name, check for conflicts
      if (updates.name && updates.name !== serverName) {
        const nameConflict = Array.isArray(currentConfig.servers)
          ? currentConfig.servers.some((s) => s.name === updates.name)
          : updates.name in currentConfig.servers;

        if (nameConflict) {
          throw new Error(
            `Server with name '${updates.name}' already exists in configuration`,
          );
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('does not exist') ||
          error.message.includes('already exists'))
      ) {
        throw error; // Re-throw validation errors
      }
      // If we can't read config, just log the operation anyway
    }

    console.info(
      `[Registry] Would update server '${serverName}' with changes:`,
    );
    console.info(JSON.stringify(updates, null, 2));
    console.info(
      `[Registry] To persist, manually update in your ${this.configPath}`,
    );
  }
}
