import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockedFs, mockExecFileAsync, createMockToken } from './test-utils.js';
import { KeychainTokenStorage } from '../../../implementations/keychain-token-storage.js';

describe('KeychainTokenStorage', () => {
  let storage: KeychainTokenStorage;
  let mockToken: ReturnType<typeof createMockToken>;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new KeychainTokenStorage('test-server');
    mockToken = createMockToken();
  });

  describe('isExpired', () => {
    it('should return true when no token is stored', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('Not found'));
      mockedFs.readFile.mockRejectedValue(new Error('File not found'));

      const result = await storage.isExpired();
      expect(result).toBe(true);
    });

    it('should return false when token is valid', async () => {
      const futureToken = {
        ...mockToken,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour in future
      };

      const tokenJson = JSON.stringify({
        accessToken: futureToken.accessToken,
        expiresAt: futureToken.expiresAt.toISOString(),
        tokenType: futureToken.tokenType,
        scope: futureToken.scope,
      });

      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockExecFileAsync.mockResolvedValue({ stdout: tokenJson, stderr: '' });

      const result = await storage.isExpired();
      expect(result).toBe(false);
    });

    it('should return true when token is expired', async () => {
      const expiredToken = {
        ...mockToken,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      };

      const tokenJson = JSON.stringify({
        accessToken: expiredToken.accessToken,
        expiresAt: expiredToken.expiresAt.toISOString(),
        tokenType: expiredToken.tokenType,
        scope: expiredToken.scope,
      });

      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockExecFileAsync.mockResolvedValue({ stdout: tokenJson, stderr: '' });

      const result = await storage.isExpired();
      expect(result).toBe(true);
    });
  });
});
