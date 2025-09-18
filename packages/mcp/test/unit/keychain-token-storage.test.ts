import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import type { TokenData } from '../../src/auth/interfaces/token-storage.interface.js';

// Create hoisted mock for execAsync
const mockExecAsync = vi.hoisted(() => vi.fn());

// Mock child_process module
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock util.promisify to return our hoisted mock function
vi.mock('util', () => ({
  promisify: () => mockExecAsync,
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
import { KeychainTokenStorage } from '../../src/auth/implementations/keychain-token-storage.js';

describe('KeychainTokenStorage', () => {
  let storage: KeychainTokenStorage;
  let mockToken: TokenData;

  beforeEach(() => {
    vi.clearAllMocks();

    storage = new KeychainTokenStorage('test-server');

    mockToken = {
      accessToken: 'test-access-token',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      tokenType: 'Bearer',
      scope: 'read write',
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create storage with server ID', () => {
      expect(storage).toBeInstanceOf(KeychainTokenStorage);
    });
  });

  describe('store', () => {
    describe('macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should store token in macOS keychain successfully', async () => {
        // Mock successful keychain store
        mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

        await storage.store(mockToken);

        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining('security add-generic-password'),
        );

        const callArgs = mockExecAsync.mock.calls[0][0] as string;
        expect(callArgs).toContain('mcp-funnel:test-server');
        expect(callArgs).toContain('test-access-token');
      });

      it('should fallback to file storage when keychain fails', async () => {
        // Mock keychain failure
        mockExecAsync.mockRejectedValue(new Error('Keychain error'));

        // Mock file operations
        mockedFs.mkdir.mockResolvedValue(undefined);
        mockedFs.writeFile.mockResolvedValue(undefined);

        await storage.store(mockToken);

        expect(mockExecAsync).toHaveBeenCalled();
        expect(mockedFs.mkdir).toHaveBeenCalled();
        expect(mockedFs.writeFile).toHaveBeenCalled();
      });
    });

    describe('Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should store token in Windows credential manager', async () => {
        mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

        await storage.store(mockToken);

        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining('cmdkey /generic:'),
        );

        const callArgs = mockExecAsync.mock.calls[0][0] as string;
        expect(callArgs).toContain('mcp-funnel:test-server');
      });
    });

    describe('Linux', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
      });

      it('should use file storage on Linux', async () => {
        mockedFs.mkdir.mockResolvedValue(undefined);
        mockedFs.writeFile.mockResolvedValue(undefined);

        await storage.store(mockToken);

        expect(mockedFs.mkdir).toHaveBeenCalledWith(
          expect.stringContaining('.mcp-funnel/tokens'),
          { recursive: true, mode: 0o700 },
        );

        expect(mockedFs.writeFile).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringContaining('test-access-token'),
          { mode: 0o600 },
        );
      });
    });
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

        mockExecAsync.mockResolvedValue({ stdout: tokenJson, stderr: '' });

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
        mockExecAsync.mockRejectedValue(new Error('Keychain error'));

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
        mockExecAsync.mockRejectedValue(new Error('Keychain error'));

        // Mock file read failure
        mockedFs.readFile.mockRejectedValue(new Error('File not found'));

        const result = await storage.retrieve();

        expect(result).toBeNull();
      });
    });
  });

  describe('clear', () => {
    describe('macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should remove token from macOS keychain', async () => {
        mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
        mockedFs.unlink.mockResolvedValue(undefined);

        await storage.clear();

        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining('security delete-generic-password'),
        );
        expect(mockedFs.unlink).toHaveBeenCalled();
      });
    });

    describe('Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should remove token from Windows credential manager', async () => {
        mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
        mockedFs.unlink.mockResolvedValue(undefined);

        await storage.clear();

        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining('cmdkey /delete:'),
        );
      });
    });
  });

  describe('isExpired', () => {
    it('should return true when no token is stored', async () => {
      mockExecAsync.mockRejectedValue(new Error('Not found'));
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
      mockExecAsync.mockResolvedValue({ stdout: tokenJson, stderr: '' });

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
      mockExecAsync.mockResolvedValue({ stdout: tokenJson, stderr: '' });

      const result = await storage.isExpired();
      expect(result).toBe(true);
    });
  });

  describe('token serialization', () => {
    it('should properly serialize and deserialize token data', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      let storedData: string = '';

      // Mock both store and retrieve operations
      mockExecAsync.mockImplementation(async (command: string) => {
        if (command.includes('add-generic-password')) {
          // Store operation - capture the token data
          // Match everything between -w " and the closing " before the next flag
          const match = command.match(/-w "(.+?)" -U/);
          if (match) {
            storedData = match[1];
          }
          return { stdout: '', stderr: '' };
        } else if (command.includes('find-generic-password')) {
          // Retrieve operation - return the stored data
          // Need to trim to match implementation
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
