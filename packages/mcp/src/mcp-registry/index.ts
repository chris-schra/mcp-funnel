/**
 * MCP Registry Module
 *
 * Main entry point for the MCP (Model Context Protocol) registry system.
 * Provides functionality for discovering, fetching, and managing MCP server
 * configurations from various registry sources.
 *
 * **Module Structure:**
 * - `interfaces/` - Core interface definitions for cache, server config, and registry contracts
 * - `types/` - Type definitions including registry-specific extensions and internal types
 * - `implementations/` - MVP implementations (NoOpCache, ReadOnlyConfigManager, etc.)
 * - `utils/` - Utility functions for registry operations
 *
 * **Key Features:**
 * - Type-safe server configuration management
 * - Registry metadata preservation
 * - Internal caching with TTL support
 * - Extensible architecture for multiple registry sources
 * @example
 * ```typescript
 * import { MCPRegistryClient, NoOpCache } from '@mcp-funnel/mcp/registry';
 *
 * const client = new MCPRegistryClient('https://registry.modelcontextprotocol.io');
 * const servers = await client.searchServers('github');
 * ```
 * @public
 */

// Export all interfaces
export * from './interfaces/cache.interface.js';
export * from './interfaces/temp-server.interface.js';
export * from './interfaces/config.interface.js';

// Export all types
export * from './types/registry.types.js';
export * from './types/config.types.js';

// Export implementations for external use
export { MCPRegistryClient } from './registry-client.js';
export { RegistryContext } from './registry-context.js';
export { NoOpCache } from './implementations/cache-noop.js';
export { TemporaryServerTracker } from './implementations/temp-server-tracker.js';
export { ReadOnlyConfigManager } from './implementations/config-readonly.js';
export { generateConfigSnippet, generateInstallInstructions } from './config-generator.js';
