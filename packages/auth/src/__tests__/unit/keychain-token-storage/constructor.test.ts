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

  describe('constructor', () => {
    it('should create storage with server ID', () => {
      expect(storage).toBeInstanceOf(KeychainTokenStorage);
    });
  });
});
