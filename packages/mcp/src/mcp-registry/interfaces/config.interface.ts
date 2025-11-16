import type { ServerConfig } from './temp-server.interface.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

/**
 * Interface for managing MCP proxy configuration.
 *
 * Provides an abstraction layer for configuration management, enabling different
 * implementation strategies across development phases.
 *
 * **MVP Implementation (Phase 1):**
 * - Read-only operations work normally
 * - Write operations (add/remove/update) will log the intended changes
 * - No actual file modification occurs
 * - Allows testing of the registry flow without persistence concerns
 *
 * **Production Implementation (Phase 2):**
 * - Full read/write capabilities
 * - Actually modifies configuration files
 * - Includes proper error handling and validation
 * - Supports atomic updates and rollback scenarios
 *
 * This design pattern allows us to build the complete registry search and
 * server management flow in Phase 1, then seamlessly upgrade to full
 * persistence in Phase 2 without changing the consumer code.
 * @public
 */
export interface IConfigManager {
  /**
   * Reads the current proxy configuration.
   * @returns Promise resolving to the current ProxyConfig
   * @throws if configuration cannot be read or is invalid
   */
  readConfig(): Promise<ProxyConfig>;

  /**
   * Adds a new server to the configuration.
   *
   * **MVP Behavior:** Logs the server that would be added
   * **Phase 2 Behavior:** Actually adds server to config file
   * @param server - The server configuration to add
   * @throws if server name conflicts with existing server
   * @throws if server configuration is invalid
   */
  addServer(server: ServerConfig): Promise<void>;

  /**
   * Removes a server from the configuration.
   *
   * **MVP Behavior:** Logs the server that would be removed
   * **Phase 2 Behavior:** Actually removes server from config file
   * @param serverName - Name of the server to remove
   * @throws if server does not exist
   */
  removeServer(serverName: string): Promise<void>;

  /**
   * Updates an existing server configuration.
   *
   * **MVP Behavior:** Logs the updates that would be applied
   * **Phase 2 Behavior:** Actually updates server in config file
   * @param serverName - Name of the server to update
   * @param updates - Partial server configuration with fields to update
   * @throws if server does not exist
   * @throws if updates would create invalid configuration
   */
  updateServer(serverName: string, updates: Partial<ServerConfig>): Promise<void>;
}
