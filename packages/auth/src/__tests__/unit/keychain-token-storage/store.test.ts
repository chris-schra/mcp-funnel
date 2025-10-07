import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockedFs, mockExecFileAsync, createMockToken } from './test-utils.js';
import { KeychainTokenStorage } from '../../../implementations/keychain-token-storage.js';
import type { TokenData } from '@mcp-funnel/core';

describe('KeychainTokenStorage', () => {
  let storage: KeychainTokenStorage;
  let mockToken: TokenData;

  beforeEach(() => {
    vi.clearAllMocks();

    storage = new KeychainTokenStorage('test-server');

    mockToken = createMockToken();
  });

  describe('store', () => {
    describe('macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should store token in macOS keychain successfully', async () => {
        // Mock successful keychain store
        mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

        await storage.store(mockToken);

        expect(mockExecFileAsync).toHaveBeenCalledWith('security', [
          'add-generic-password',
          '-a',
          'mcp-funnel:test-server',
          '-s',
          'mcp-funnel',
          '-w',
          expect.any(String), // JSON token data
          '-U',
        ]);

        const callArgs = mockExecFileAsync.mock.calls[0][1] as string[];
        expect(callArgs[2]).toBe('mcp-funnel:test-server');
        expect(callArgs[6]).toContain('test-access-token');
      });

      it('should fallback to file storage when keychain fails', async () => {
        // Mock keychain failure
        mockExecFileAsync.mockRejectedValue(new Error('Keychain error'));

        // Mock file operations
        mockedFs.mkdir.mockResolvedValue(undefined);
        mockedFs.writeFile.mockResolvedValue(undefined);

        await storage.store(mockToken);

        expect(mockExecFileAsync).toHaveBeenCalled();
        expect(mockedFs.mkdir).toHaveBeenCalled();
        expect(mockedFs.writeFile).toHaveBeenCalled();
      });
    });

    describe('Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should store token in Windows credential manager', async () => {
        mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

        await storage.store(mockToken);

        expect(mockExecFileAsync).toHaveBeenCalledWith('cmdkey', [
          '/generic:mcp-funnel:test-server',
          '/user:mcp-funnel',
          expect.stringContaining('test-access-token'),
        ]);
      });

      it('should fallback to file storage when Windows credential manager fails', async () => {
        // Mock Windows credential manager failure
        mockExecFileAsync.mockRejectedValue(new Error('Windows credential error'));

        // Mock file operations
        mockedFs.mkdir.mockResolvedValue(undefined);
        mockedFs.writeFile.mockResolvedValue(undefined);

        await storage.store(mockToken);

        expect(mockExecFileAsync).toHaveBeenCalled();
        expect(mockedFs.mkdir).toHaveBeenCalled();
        expect(mockedFs.writeFile).toHaveBeenCalled();
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

        expect(mockedFs.mkdir).toHaveBeenCalledWith(expect.stringContaining('.mcp-funnel/tokens'), {
          recursive: true,
          mode: 0o700,
        });

        expect(mockedFs.writeFile).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringContaining('test-access-token'),
          { mode: 0o600 },
        );
      });
    });
  });
});
