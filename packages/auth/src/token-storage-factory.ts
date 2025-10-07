import { KeychainTokenStorage } from './implementations/keychain-token-storage.js';
import { MemoryTokenStorage } from './implementations/memory-token-storage.js';
import { type ITokenStorage, logEvent } from '@mcp-funnel/core';

/**
 * Storage type configuration for token persistence strategy
 * @public
 */
export type TokenStorageType = 'memory' | 'keychain' | 'auto';

/**
 * Factory for creating appropriate token storage implementations based on environment and configuration.
 *
 * Automatically selects between memory storage (ephemeral) and keychain storage (persistent)
 * based on the environment. In CI/test environments, defaults to memory storage.
 * In production, uses OS-native keychain when available.
 * @example
 * ```typescript
 * // Auto-select based on environment
 * const storage = TokenStorageFactory.create('auto', 'my-server');
 *
 * // Explicitly use memory storage
 * const memStorage = TokenStorageFactory.create('memory');
 *
 * // Explicitly use keychain storage
 * const keychainStorage = TokenStorageFactory.create('keychain', 'my-server');
 * ```
 * @public
 * @see file:./implementations/memory-token-storage.ts - In-memory implementation
 * @see file:./implementations/keychain-token-storage.ts - OS keychain implementation
 */
export class TokenStorageFactory {
  /**
   * Create appropriate token storage based on environment and configuration.
   *
   * When type is 'auto', automatically selects storage based on environment:
   * - CI/test environments: memory storage
   * - Production: keychain storage (with fallback to memory if serverId is missing)
   * @param type - Storage type selection ('memory', 'keychain', or 'auto' for automatic)
   * @param serverId - Server identifier required for keychain storage (optional for memory)
   * @returns Token storage implementation (ITokenStorage interface)
   * @public
   */
  public static create(type: TokenStorageType = 'auto', serverId?: string): ITokenStorage {
    const resolvedType = this.resolveStorageType(type);

    switch (resolvedType) {
      case 'memory':
        logEvent('debug', 'auth:storage_created', {
          type: 'memory',
          serverId,
          reason: 'Explicit memory storage requested or CI environment detected',
        });
        return new MemoryTokenStorage();

      case 'keychain':
        if (!serverId) {
          logEvent('warn', 'auth:storage_fallback', {
            from: 'keychain',
            to: 'memory',
            reason: 'Server ID required for keychain storage',
          });
          return new MemoryTokenStorage();
        }

        logEvent('debug', 'auth:storage_created', {
          type: 'keychain',
          serverId,
          platform: process.platform,
        });
        return new KeychainTokenStorage(serverId);

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = resolvedType;
        throw new Error(`Unsupported storage type: ${resolvedType}`);
      }
    }
  }

  /**
   * Resolve 'auto' type to appropriate concrete type based on environment.
   *
   * Checks CI, NODE_ENV, and MCP_TOKEN_STORAGE environment variables to determine
   * the most appropriate storage type.
   * @param type - Storage type that may include 'auto'
   * @returns Concrete storage type ('memory' or 'keychain')
   * @internal
   */
  private static resolveStorageType(type: TokenStorageType): 'memory' | 'keychain' {
    if (type !== 'auto') {
      return type;
    }

    // Use memory storage in CI/CD environments or when explicitly requested
    if (
      process.env.CI ||
      process.env.NODE_ENV === 'test' ||
      process.env.MCP_TOKEN_STORAGE === 'memory'
    ) {
      return 'memory';
    }

    // Use keychain storage for better security in normal environments
    return 'keychain';
  }

  /**
   * Check if keychain storage is available on current platform.
   *
   * Returns true for all platforms:
   * - macOS: Uses security command for Keychain access
   * - Windows: Uses cmdkey for Credential Manager
   * - Linux: Falls back to secure file storage
   * @returns True if keychain is available (always true in current implementation)
   * @public
   */
  public static isKeychainAvailable(): boolean {
    // macOS has security command
    if (process.platform === 'darwin') {
      return true;
    }

    // Windows has cmdkey command
    if (process.platform === 'win32') {
      return true;
    }

    // Linux falls back to secure file storage
    // Still considered "available" as it's more secure than memory
    return true;
  }

  /**
   * Get recommended storage type for current environment.
   *
   * Recommends memory storage for CI/test environments, otherwise recommends
   * keychain storage for better security in production.
   * @returns Recommended storage type ('memory' or 'keychain')
   * @public
   */
  public static getRecommendedType(): TokenStorageType {
    if (process.env.CI || process.env.NODE_ENV === 'test') {
      return 'memory';
    }

    return this.isKeychainAvailable() ? 'keychain' : 'memory';
  }
}
