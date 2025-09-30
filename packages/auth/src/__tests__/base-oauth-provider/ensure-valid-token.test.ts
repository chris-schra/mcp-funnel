import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TestOAuthProvider,
  MockTokenStorage,
  createTestToken,
} from './test-utils.js';
import { AuthenticationError } from '../../errors/authentication-error.js';
import type { ITokenStorage } from '@mcp-funnel/core';

describe('BaseOAuthProvider - ensureValidToken', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should return existing valid token', async () => {
    const token = createTestToken();
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(false);

    const result = await provider.testEnsureValidToken();

    expect(result).toEqual(token);
    expect(provider.acquireTokenMock).not.toHaveBeenCalled();
  });

  it('should schedule proactive refresh for valid token', async () => {
    const token = createTestToken(3600000); // 1 hour
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(false);

    await provider.testEnsureValidToken();

    expect(mockStorage.scheduleRefreshMock).toHaveBeenCalled();
  });

  it('should acquire new token when expired', async () => {
    const expiredToken = createTestToken(-1000);
    const newToken = createTestToken();

    mockStorage.setToken(expiredToken);
    mockStorage.isExpiredMock.mockResolvedValue(true);

    provider.acquireTokenMock.mockImplementation(async () => {
      mockStorage.setToken(newToken);
    });

    const result = await provider.testEnsureValidToken();

    expect(provider.acquireTokenMock).toHaveBeenCalled();
    expect(result).toEqual(newToken);
  });

  it('should throw error if token acquisition fails', async () => {
    mockStorage.setToken(null);
    provider.acquireTokenMock.mockResolvedValue(undefined);

    await expect(provider.testEnsureValidToken()).rejects.toThrow(
      AuthenticationError,
    );
    await expect(provider.testEnsureValidToken()).rejects.toThrow(
      'Failed to acquire OAuth2 token',
    );
  });

  it('should not schedule refresh when storage does not support it', async () => {
    const token = createTestToken();
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(false);

    // Create a storage without scheduleRefresh method
    const storageWithoutSchedule = {
      store: mockStorage.store.bind(mockStorage),
      retrieve: mockStorage.retrieve.bind(mockStorage),
      clear: mockStorage.clear.bind(mockStorage),
      isExpired: mockStorage.isExpired.bind(mockStorage),
      // No scheduleRefresh method
    } as ITokenStorage;

    const providerWithoutSchedule = new TestOAuthProvider(
      storageWithoutSchedule,
    );

    const result = await providerWithoutSchedule.testEnsureValidToken();

    expect(result).toEqual(token);
    // Should not throw or cause issues
  });
});
