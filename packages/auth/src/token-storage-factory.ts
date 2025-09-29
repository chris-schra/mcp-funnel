import { KeychainTokenStorage } from './implementations/keychain-token-storage.js';
import { MemoryTokenStorage } from './implementations/memory-token-storage.js';
import { type ITokenStorage, logEvent } from '@mcp-funnel/core';

/**
 * Storage type configuration
 */
export type TokenStorageType = 'memory' | 'keychain' | 'auto';

/**
 * Factory for creating appropriate token storage implementations
 * Follows the same pattern as TransportFactory - reusing existing architecture
 */
export class TokenStorageFactory {
  /**
   * Create appropriate token storage based on environment and configuration
   */
  public static create(
    type: TokenStorageType = 'auto',
    serverId?: string,
  ): ITokenStorage {
    const resolvedType = this.resolveStorageType(type);

    switch (resolvedType) {
      case 'memory':
        logEvent('debug', 'auth:storage_created', {
          type: 'memory',
          serverId,
          reason:
            'Explicit memory storage requested or CI environment detected',
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
   * Resolve 'auto' type to appropriate concrete type based on environment
   */
  private static resolveStorageType(
    type: TokenStorageType,
  ): 'memory' | 'keychain' {
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
   * Check if keychain storage is available on current platform
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
   * Get recommended storage type for current environment
   */
  public static getRecommendedType(): TokenStorageType {
    if (process.env.CI || process.env.NODE_ENV === 'test') {
      return 'memory';
    }

    return this.isKeychainAvailable() ? 'keychain' : 'memory';
  }
}
