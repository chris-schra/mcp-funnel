import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockExecFileAsync, createMockToken } from './test-utils.js';
import { KeychainTokenStorage } from '../../../implementations/keychain-token-storage.js';

describe('KeychainTokenStorage', () => {
  let storage: KeychainTokenStorage;
  let mockToken: ReturnType<typeof createMockToken>;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new KeychainTokenStorage('test-server');
    mockToken = createMockToken();
  });

  describe('token serialization', () => {
    it('should properly serialize and deserialize token data', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      let storedData: string = '';

      // Mock both store and retrieve operations
      mockExecFileAsync.mockImplementation(async (...commandArgs: unknown[]) => {
        const command = commandArgs[0] as string;
        const args = commandArgs[1] as string[];

        if (command === 'security' && args[0] === 'add-generic-password') {
          // Store operation - capture the token data from args[6] (-w value)
          storedData = args[6];
          return { stdout: '', stderr: '' };
        } else if (command === 'security' && args[0] === 'find-generic-password') {
          // Retrieve operation - return the stored data
          return { stdout: storedData + '\n', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      });

      // Store token
      await storage.store(mockToken);

      // Verify storedData was captured
      expect(storedData).toBeTruthy();
      expect(storedData).toContain('test-access-token');

      // Verify it's valid JSON
      expect(() => JSON.parse(storedData)).not.toThrow();

      // Retrieve token
      const result = await storage.retrieve();

      expect(result).toEqual({
        accessToken: mockToken.accessToken,
        expiresAt: mockToken.expiresAt,
        tokenType: mockToken.tokenType,
        scope: mockToken.scope,
      });
    });
  });
});
