import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenStorageFactory } from '../../../token-storage-factory.js';
import { MemoryTokenStorage } from '../../../implementations/memory-token-storage.js';
import { KeychainTokenStorage } from '../../../implementations/keychain-token-storage.js';

describe('TokenStorageFactory', () => {
  // Store original env values to restore them later
  const originalEnv = {
    CI: process.env.CI,
    NODE_ENV: process.env.NODE_ENV,
    MCP_TOKEN_STORAGE: process.env.MCP_TOKEN_STORAGE,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variables before each test
    delete process.env.CI;
    delete process.env.NODE_ENV;
    delete process.env.MCP_TOKEN_STORAGE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original environment variables
    process.env.CI = originalEnv.CI;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.MCP_TOKEN_STORAGE = originalEnv.MCP_TOKEN_STORAGE;
  });

  describe('create() - explicit type="memory"', () => {
    it('should return MemoryTokenStorage instance without serverId', () => {
      const storage = TokenStorageFactory.create('memory');
      expect(storage).toBeInstanceOf(MemoryTokenStorage);
    });

    it('should return MemoryTokenStorage instance with serverId', () => {
      const storage = TokenStorageFactory.create('memory', 'test-server');
      expect(storage).toBeInstanceOf(MemoryTokenStorage);
    });
  });

  describe('create() - explicit type="keychain"', () => {
    it('should return KeychainTokenStorage when serverId is provided', () => {
      const storage = TokenStorageFactory.create('keychain', 'test-server');
      expect(storage).toBeInstanceOf(KeychainTokenStorage);
    });

    it('should fallback to MemoryTokenStorage when serverId is missing', () => {
      const storage = TokenStorageFactory.create('keychain');
      expect(storage).toBeInstanceOf(MemoryTokenStorage);
    });

    it('should fallback to MemoryTokenStorage when serverId is undefined', () => {
      const storage = TokenStorageFactory.create('keychain', undefined);
      expect(storage).toBeInstanceOf(MemoryTokenStorage);
    });

    it('should fallback to MemoryTokenStorage when serverId is empty string', () => {
      const storage = TokenStorageFactory.create('keychain', '');
      expect(storage).toBeInstanceOf(MemoryTokenStorage);
    });
  });

  describe('create() - type="auto" with environment detection', () => {
    describe('CI environment', () => {
      it('should return MemoryTokenStorage when CI=true', () => {
        process.env.CI = 'true';
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });

      it('should return MemoryTokenStorage when CI=1', () => {
        process.env.CI = '1';
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });

      it('should return MemoryTokenStorage in CI even without serverId', () => {
        process.env.CI = 'true';
        const storage = TokenStorageFactory.create('auto');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });
    });

    describe('test environment', () => {
      it('should return MemoryTokenStorage when NODE_ENV=test', () => {
        process.env.NODE_ENV = 'test';
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });

      it('should return MemoryTokenStorage in test env even without serverId', () => {
        process.env.NODE_ENV = 'test';
        const storage = TokenStorageFactory.create('auto');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });
    });

    describe('explicit MCP_TOKEN_STORAGE override', () => {
      it('should return MemoryTokenStorage when MCP_TOKEN_STORAGE=memory', () => {
        process.env.MCP_TOKEN_STORAGE = 'memory';
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });

      it('should return MemoryTokenStorage when MCP_TOKEN_STORAGE=memory even without serverId', () => {
        process.env.MCP_TOKEN_STORAGE = 'memory';
        const storage = TokenStorageFactory.create('auto');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });
    });

    describe('production environment', () => {
      it('should return KeychainTokenStorage with serverId', () => {
        // No CI, no NODE_ENV=test, no MCP_TOKEN_STORAGE override
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(KeychainTokenStorage);
      });

      it('should fallback to MemoryTokenStorage without serverId', () => {
        // No CI, no NODE_ENV=test, no MCP_TOKEN_STORAGE override
        const storage = TokenStorageFactory.create('auto');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });

      it('should return KeychainTokenStorage when NODE_ENV=production with serverId', () => {
        process.env.NODE_ENV = 'production';
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(KeychainTokenStorage);
      });

      it('should return KeychainTokenStorage when NODE_ENV=development with serverId', () => {
        process.env.NODE_ENV = 'development';
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(KeychainTokenStorage);
      });
    });

    describe('environment variable precedence', () => {
      it('should prioritize CI over NODE_ENV', () => {
        process.env.CI = 'true';
        process.env.NODE_ENV = 'production';
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });

      it('should prioritize MCP_TOKEN_STORAGE over other env vars', () => {
        process.env.MCP_TOKEN_STORAGE = 'memory';
        process.env.NODE_ENV = 'production';
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });

      it('should prioritize NODE_ENV=test over production setting', () => {
        process.env.NODE_ENV = 'test';
        const storage = TokenStorageFactory.create('auto', 'test-server');
        expect(storage).toBeInstanceOf(MemoryTokenStorage);
      });
    });
  });

  describe('create() - default parameter', () => {
    it('should default to auto when type is not specified', () => {
      // In production-like environment (no CI, no test), should use keychain
      const storage = TokenStorageFactory.create(undefined, 'test-server');
      expect(storage).toBeInstanceOf(KeychainTokenStorage);
    });

    it('should default to auto in CI environment', () => {
      process.env.CI = 'true';
      const storage = TokenStorageFactory.create(undefined, 'test-server');
      expect(storage).toBeInstanceOf(MemoryTokenStorage);
    });
  });

  describe('isKeychainAvailable()', () => {
    it('should return true (always available in current implementation)', () => {
      const result = TokenStorageFactory.isKeychainAvailable();
      expect(result).toBe(true);
    });

    it('should return boolean type', () => {
      const result = TokenStorageFactory.isKeychainAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getRecommendedType()', () => {
    it('should recommend memory storage in CI environment', () => {
      process.env.CI = 'true';
      const type = TokenStorageFactory.getRecommendedType();
      expect(type).toBe('memory');
    });

    it('should recommend memory storage in test environment', () => {
      process.env.NODE_ENV = 'test';
      const type = TokenStorageFactory.getRecommendedType();
      expect(type).toBe('memory');
    });

    it('should recommend memory storage when CI=1', () => {
      process.env.CI = '1';
      const type = TokenStorageFactory.getRecommendedType();
      expect(type).toBe('memory');
    });

    it('should recommend keychain storage in production', () => {
      process.env.NODE_ENV = 'production';
      const type = TokenStorageFactory.getRecommendedType();
      expect(type).toBe('keychain');
    });

    it('should recommend keychain storage in development', () => {
      process.env.NODE_ENV = 'development';
      const type = TokenStorageFactory.getRecommendedType();
      expect(type).toBe('keychain');
    });

    it('should recommend keychain storage when no env vars are set', () => {
      const type = TokenStorageFactory.getRecommendedType();
      expect(type).toBe('keychain');
    });

    it('should prioritize CI over other env vars', () => {
      process.env.CI = 'true';
      process.env.NODE_ENV = 'production';
      const type = TokenStorageFactory.getRecommendedType();
      expect(type).toBe('memory');
    });

    it('should prioritize NODE_ENV=test over production', () => {
      process.env.NODE_ENV = 'test';
      const type = TokenStorageFactory.getRecommendedType();
      expect(type).toBe('memory');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple consecutive create calls', () => {
      const storage1 = TokenStorageFactory.create('memory');
      const storage2 = TokenStorageFactory.create('keychain', 'test-server');
      const storage3 = TokenStorageFactory.create('auto', 'another-server');

      expect(storage1).toBeInstanceOf(MemoryTokenStorage);
      expect(storage2).toBeInstanceOf(KeychainTokenStorage);
      expect(storage3).toBeInstanceOf(KeychainTokenStorage);
    });

    it('should create independent storage instances', () => {
      const storage1 = TokenStorageFactory.create('memory');
      const storage2 = TokenStorageFactory.create('memory');

      expect(storage1).not.toBe(storage2);
      expect(storage1).toBeInstanceOf(MemoryTokenStorage);
      expect(storage2).toBeInstanceOf(MemoryTokenStorage);
    });

    it('should handle serverId with special characters', () => {
      const storage = TokenStorageFactory.create('keychain', 'test-server-123');
      expect(storage).toBeInstanceOf(KeychainTokenStorage);
    });

    it('should throw error for whitespace-only serverId with keychain type', () => {
      // KeychainTokenStorage validates serverId and rejects whitespace-only strings
      expect(() => {
        TokenStorageFactory.create('keychain', '   ');
      }).toThrow('Invalid serverId');
    });
  });

  describe('exhaustiveness and defensive checks', () => {
    it('should throw error for invalid storage type', () => {
      // Test the exhaustiveness check in the switch statement
      // This simulates what would happen if an invalid type somehow bypassed TypeScript
      // Use a dynamic function to avoid TypeScript compile-time checks
      const getInvalidType = (): string => 'invalid-type';

      expect(() => {
        // TypeScript sees this as string, but at runtime it's an invalid TokenStorageType
        TokenStorageFactory.create(getInvalidType() as 'memory');
      }).toThrow('Unsupported storage type');
    });
  });

  describe('type safety and return types', () => {
    it('should return ITokenStorage compatible instance for memory type', () => {
      const storage = TokenStorageFactory.create('memory');

      // Check that storage has required ITokenStorage methods
      expect(typeof storage.store).toBe('function');
      expect(typeof storage.retrieve).toBe('function');
      expect(typeof storage.clear).toBe('function');
      expect(typeof storage.isExpired).toBe('function');
    });

    it('should return ITokenStorage compatible instance for keychain type', () => {
      const storage = TokenStorageFactory.create('keychain', 'test-server');

      // Check that storage has required ITokenStorage methods
      expect(typeof storage.store).toBe('function');
      expect(typeof storage.retrieve).toBe('function');
      expect(typeof storage.clear).toBe('function');
      expect(typeof storage.isExpired).toBe('function');
    });

    it('should return ITokenStorage compatible instance for auto type', () => {
      const storage = TokenStorageFactory.create('auto', 'test-server');

      // Check that storage has required ITokenStorage methods
      expect(typeof storage.store).toBe('function');
      expect(typeof storage.retrieve).toBe('function');
      expect(typeof storage.clear).toBe('function');
      expect(typeof storage.isExpired).toBe('function');
    });
  });
});
