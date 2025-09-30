import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TestOAuthProvider,
  MockTokenStorage,
  createTestToken,
} from './test-utils.js';

describe('BaseOAuthProvider - isValid', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should return true for valid non-expired token', async () => {
    const token = createTestToken();
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(false);

    const isValid = await provider.isValid();

    expect(isValid).toBe(true);
  });

  it('should return false when no token exists', async () => {
    mockStorage.setToken(null);

    const isValid = await provider.isValid();

    expect(isValid).toBe(false);
  });

  it('should return false for expired token', async () => {
    const token = createTestToken();
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(true);

    const isValid = await provider.isValid();

    expect(isValid).toBe(false);
  });

  it('should return false when storage throws error', async () => {
    mockStorage.retrieveMock.mockRejectedValue(new Error('Storage error'));

    const isValid = await provider.isValid();

    expect(isValid).toBe(false);
  });

  it('should return false when isExpired throws error', async () => {
    const token = createTestToken();
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockRejectedValue(
      new Error('Expiry check failed'),
    );

    const isValid = await provider.isValid();

    expect(isValid).toBe(false);
  });
});
