import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';

// Create hoisted mock for execFileAsync
const mockExecFileAsync = vi.hoisted(() => vi.fn());

// Mock child_process module
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock util.promisify to return our hoisted mock function
vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
  },
}));
const mockedFs = vi.mocked(fs);

// Import after mocks are set up
import { KeychainTokenStorage } from '../../../implementations/keychain-token-storage.js';
import type { TokenData } from '@mcp-funnel/core';

/**
 * Creates a mock token for testing keychain storage operations
 * @returns Mock token data with standard test values
 */
function createMockToken(): TokenData {
  return {
    accessToken: 'test-access-token',
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    tokenType: 'Bearer',
    scope: 'read write',
  };
}

describe('KeychainTokenStorage', () => {
  let storage: KeychainTokenStorage;
  let mockToken: TokenData;

  beforeEach(() => {
    vi.clearAllMocks();

    storage = new KeychainTokenStorage('test-server');
    mockToken = createMockToken();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('retrieve', () => {
    describe('macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should retrieve token from macOS keychain successfully', async () => {
        const tokenJson = JSON.stringify({
          accessToken: mockToken.accessToken,
          expiresAt: mockToken.expiresAt.toISOString(),
          tokenType: mockToken.tokenType,
          scope: mockToken.scope,
        });

        mockExecFileAsync.mockResolvedValue({ stdout: tokenJson, stderr: '' });

        const result = await storage.retrieve();

        expect(result).toEqual({
          accessToken: mockToken.accessToken,
          expiresAt: mockToken.expiresAt,
          tokenType: mockToken.tokenType,
          scope: mockToken.scope,
        });
      });

      it('should fallback to file storage when keychain retrieval fails', async () => {
        const tokenJson = JSON.stringify({
          accessToken: mockToken.accessToken,
          expiresAt: mockToken.expiresAt.toISOString(),
          tokenType: mockToken.tokenType,
          scope: mockToken.scope,
        });

        // Mock keychain failure
        mockExecFileAsync.mockRejectedValue(new Error('Keychain error'));

        // Mock successful file read
        mockedFs.readFile.mockResolvedValue(tokenJson);

        const result = await storage.retrieve();

        expect(result).toEqual({
          accessToken: mockToken.accessToken,
          expiresAt: mockToken.expiresAt,
          tokenType: mockToken.tokenType,
          scope: mockToken.scope,
        });
      });

      it('should return null when both keychain and file fail', async () => {
        // Mock keychain failure
        mockExecFileAsync.mockRejectedValue(new Error('Keychain error'));

        // Mock file read failure
        mockedFs.readFile.mockRejectedValue(new Error('File not found'));

        const result = await storage.retrieve();

        expect(result).toBeNull();
      });
    });

    describe('Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should retrieve token from Windows credential manager successfully', async () => {
        const tokenJson = JSON.stringify({
          accessToken: mockToken.accessToken,
          expiresAt: mockToken.expiresAt.toISOString(),
          tokenType: mockToken.tokenType,
          scope: mockToken.scope,
        });

        mockExecFileAsync.mockResolvedValue({ stdout: tokenJson, stderr: '' });

        const result = await storage.retrieve();

        expect(mockExecFileAsync).toHaveBeenCalledWith('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          expect.stringContaining('Windows.Security.Credentials.PasswordVault'),
        ]);

        expect(result).toEqual({
          accessToken: mockToken.accessToken,
          expiresAt: mockToken.expiresAt,
          tokenType: mockToken.tokenType,
          scope: mockToken.scope,
        });
      });

      it('should fallback to file storage when Windows credential retrieval fails', async () => {
        const tokenJson = JSON.stringify({
          accessToken: mockToken.accessToken,
          expiresAt: mockToken.expiresAt.toISOString(),
          tokenType: mockToken.tokenType,
          scope: mockToken.scope,
        });

        // Mock Windows credential retrieval failure
        mockExecFileAsync.mockRejectedValue(new Error('PowerShell error'));

        // Mock successful file read
        mockedFs.readFile.mockResolvedValue(tokenJson);

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
});
