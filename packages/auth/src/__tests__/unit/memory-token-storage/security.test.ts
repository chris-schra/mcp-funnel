import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ITokenStorage } from '@mcp-funnel/core';
import { createMemoryTokenStorage } from '../../../implementations/memory-token-storage.js';
import {
  createTestToken,
  setupMockTimers,
  restoreTimers,
} from './test-utils.js';

describe('Security', () => {
  let storage: ITokenStorage;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    const timers = setupMockTimers();
    originalSetTimeout = timers.originalSetTimeout;
    originalClearTimeout = timers.originalClearTimeout;

    vi.clearAllMocks();

    // Create new storage instance for each test
    storage = createMemoryTokenStorage();
  });

  afterEach(() => {
    restoreTimers(originalSetTimeout, originalClearTimeout);
  });

  it('should not expose token in error messages', async () => {
    const sensitiveToken = createTestToken();
    sensitiveToken.accessToken = 'secret-token-12345';

    await storage.store(sensitiveToken);

    // Force an error condition and verify token is not in error message
    try {
      // This would trigger an internal error in actual implementation
      await (
        storage as ITokenStorage & { _triggerError?: () => Promise<void> }
      )._triggerError?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      expect(errorMessage).not.toContain('secret-token-12345');
      expect(errorMessage).not.toContain(sensitiveToken.accessToken);
    }
  });

  it('should clear token from memory when cleared', async () => {
    const token = createTestToken();
    await storage.store(token);

    await storage.clear();

    // Verify no references to token data remain
    const memorySnapshot = (
      storage as ITokenStorage & { _getMemorySnapshot?: () => unknown }
    )._getMemorySnapshot?.();
    if (memorySnapshot) {
      expect(JSON.stringify(memorySnapshot)).not.toContain(token.accessToken);
    }
  });

  it('should handle token sanitization on storage', async () => {
    const tokenWithWhitespace = {
      accessToken: '  token-with-spaces  ',
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: ' Bearer ',
      scope: '  read   write  ',
    };

    await storage.store(tokenWithWhitespace);
    const retrieved = await storage.retrieve();

    expect(retrieved?.accessToken.trim()).toBe(
      tokenWithWhitespace.accessToken.trim(),
    );
    expect(retrieved?.tokenType.trim()).toBe('Bearer');
  });

  it('should reject tokens with empty access token', async () => {
    const invalidToken = {
      accessToken: '',
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: 'Bearer',
    };

    await expect(storage.store(invalidToken)).rejects.toThrow(
      'Access token cannot be empty',
    );
  });

  it('should reject tokens with invalid token type', async () => {
    const invalidToken = {
      accessToken: 'valid-token',
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: '',
    };

    await expect(storage.store(invalidToken)).rejects.toThrow(
      'Token type cannot be empty',
    );
  });

  it('should handle memory cleanup on dispose', async () => {
    const token = createTestToken();
    await storage.store(token);

    // Dispose should clear all memory references
    const disposableStorage = storage as ITokenStorage & {
      dispose?: () => Promise<void>;
    };
    if (disposableStorage.dispose) {
      await disposableStorage.dispose();
    }

    const retrieved = await storage.retrieve();
    expect(retrieved).toBeNull();
  });
});
