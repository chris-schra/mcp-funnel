import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  TestOAuthProvider,
  MockTokenStorage,
  createTestToken,
} from './base-oauth-provider-test-helpers.js';

// Mock the logger module
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

describe('BaseOAuthProvider - Integration Scenarios', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should handle full token lifecycle', async () => {
    // Initial state - no token
    mockStorage.setToken(null);

    // First call should acquire token
    const newToken = createTestToken();
    provider.acquireTokenMock.mockImplementation(async () => {
      mockStorage.setToken(newToken);
    });
    mockStorage.isExpiredMock.mockResolvedValue(false);

    const headers1 = await provider.getHeaders();
    expect(headers1.Authorization).toBe(`Bearer ${newToken.accessToken}`);
    expect(provider.acquireTokenMock).toHaveBeenCalledTimes(1);

    // Second call should use cached token
    const headers2 = await provider.getHeaders();
    expect(headers2.Authorization).toBe(`Bearer ${newToken.accessToken}`);
    expect(provider.acquireTokenMock).toHaveBeenCalledTimes(1);

    // Token expires
    mockStorage.isExpiredMock.mockResolvedValue(true);
    const refreshedToken = createTestToken();
    provider.acquireTokenMock.mockImplementation(async () => {
      mockStorage.setToken(refreshedToken);
    });

    // Third call should refresh token
    const headers3 = await provider.getHeaders();
    expect(headers3.Authorization).toBe(`Bearer ${refreshedToken.accessToken}`);
    expect(provider.acquireTokenMock).toHaveBeenCalledTimes(2);
  });

  it('should handle concurrent requests during token acquisition', async () => {
    mockStorage.setToken(null);

    let resolveAcquireToken: () => void;
    const acquireTokenPromise = new Promise<void>((resolve) => {
      resolveAcquireToken = resolve;
    });

    const newToken = createTestToken();
    provider.acquireTokenMock.mockImplementation(async () => {
      await acquireTokenPromise;
      mockStorage.setToken(newToken);
    });

    // Start multiple concurrent requests
    const headerPromises = [
      provider.getHeaders(),
      provider.getHeaders(),
      provider.getHeaders(),
    ];

    // Give a small delay to allow promises to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Token acquisition should be in progress
    expect(provider.acquireTokenMock).toHaveBeenCalledTimes(1);

    // Complete token acquisition
    resolveAcquireToken!();

    const results = await Promise.all(headerPromises);

    // All requests should get the same token
    results.forEach((headers) => {
      expect(headers.Authorization).toBe(`Bearer ${newToken.accessToken}`);
    });

    // Should only acquire token once
    expect(provider.acquireTokenMock).toHaveBeenCalledTimes(1);
  });

  it('should handle storage errors gracefully', async () => {
    const token = createTestToken();
    mockStorage.setToken(token);

    // First call to retrieve fails, then succeeds after refresh
    mockStorage.retrieveMock
      .mockRejectedValueOnce(new Error('Storage error'))
      .mockResolvedValue(token);

    // Should still be able to operate
    const isValid = await provider.isValid();
    expect(isValid).toBe(false);

    // Should try to acquire new token
    provider.acquireTokenMock.mockImplementation(async () => {
      mockStorage.setToken(token);
    });

    const headers = await provider.getHeaders();
    expect(headers.Authorization).toBe(`Bearer ${token.accessToken}`);
  });
});
