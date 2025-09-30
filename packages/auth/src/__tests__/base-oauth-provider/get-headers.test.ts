import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TestOAuthProvider,
  MockTokenStorage,
  createTestToken,
} from './test-utils.js';

describe('BaseOAuthProvider - getHeaders', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should return authorization headers with valid token', async () => {
    const token = createTestToken();
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(false);

    const headers = await provider.getHeaders();

    expect(headers).toEqual({
      Authorization: `${token.tokenType} ${token.accessToken}`,
    });
  });

  it('should acquire new token when none exists', async () => {
    const newToken = createTestToken();
    mockStorage.setToken(null);
    mockStorage.isExpiredMock.mockResolvedValue(true);

    provider.acquireTokenMock.mockImplementation(async () => {
      mockStorage.setToken(newToken);
    });

    const headers = await provider.getHeaders();

    expect(provider.acquireTokenMock).toHaveBeenCalled();
    expect(headers).toEqual({
      Authorization: `${newToken.tokenType} ${newToken.accessToken}`,
    });
  });

  it('should acquire new token when current is expired', async () => {
    const expiredToken = createTestToken(-1000); // expired
    const newToken = createTestToken();

    mockStorage.setToken(expiredToken);
    mockStorage.isExpiredMock.mockResolvedValue(true);

    provider.acquireTokenMock.mockImplementation(async () => {
      mockStorage.setToken(newToken);
    });

    const headers = await provider.getHeaders();

    expect(provider.acquireTokenMock).toHaveBeenCalled();
    expect(headers).toEqual({
      Authorization: `${newToken.tokenType} ${newToken.accessToken}`,
    });
  });

  it('should use custom token type', async () => {
    const token = createTestToken();
    token.tokenType = 'Custom';
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(false);

    const headers = await provider.getHeaders();

    expect(headers).toEqual({
      Authorization: `Custom ${token.accessToken}`,
    });
  });
});
