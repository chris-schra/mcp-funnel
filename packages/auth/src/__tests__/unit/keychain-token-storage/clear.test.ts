import { mockedFs, mockExecFileAsync } from './test-utils.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeychainTokenStorage } from '../../../implementations/keychain-token-storage.js';

describe('KeychainTokenStorage', () => {
  let storage: KeychainTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new KeychainTokenStorage('test-server');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('clear', () => {
    describe('macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should remove token from macOS keychain', async () => {
        mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
        mockedFs.unlink.mockResolvedValue(undefined);

        await storage.clear();

        expect(mockExecFileAsync).toHaveBeenCalledWith('security', [
          'delete-generic-password',
          '-a',
          'mcp-funnel:test-server',
          '-s',
          'mcp-funnel',
        ]);
        expect(mockedFs.unlink).toHaveBeenCalled();
      });
    });

    describe('Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should remove token from Windows credential manager', async () => {
        mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
        mockedFs.unlink.mockResolvedValue(undefined);

        await storage.clear();

        expect(mockExecFileAsync).toHaveBeenCalledWith('cmdkey', [
          '/delete:mcp-funnel:test-server',
        ]);
      });
    });
  });
});
