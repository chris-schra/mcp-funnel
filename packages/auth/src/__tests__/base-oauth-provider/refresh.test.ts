import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestOAuthProvider, MockTokenStorage } from './test-utils.js';

describe('BaseOAuthProvider - refresh', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should call acquireToken once', async () => {
    provider.acquireTokenMock.mockResolvedValue(undefined);

    await provider.refresh();

    expect(provider.acquireTokenMock).toHaveBeenCalledTimes(1);
  });

  it('should handle concurrent refresh calls', async () => {
    let resolveAcquireToken: () => void;
    const acquireTokenPromise = new Promise<void>((resolve) => {
      resolveAcquireToken = resolve;
    });

    provider.acquireTokenMock.mockReturnValue(acquireTokenPromise);

    // Start multiple refresh calls concurrently
    const refreshPromise1 = provider.refresh();
    const refreshPromise2 = provider.refresh();
    const refreshPromise3 = provider.refresh();

    // Resolve the token acquisition
    resolveAcquireToken!();

    await Promise.all([refreshPromise1, refreshPromise2, refreshPromise3]);

    // Should only call acquireToken once
    expect(provider.acquireTokenMock).toHaveBeenCalledTimes(1);
  });

  it('should reset refresh promise after completion', async () => {
    provider.acquireTokenMock.mockResolvedValue(undefined);

    await provider.refresh();
    await provider.refresh();

    // Should call acquireToken twice since they're sequential
    expect(provider.acquireTokenMock).toHaveBeenCalledTimes(2);
  });

  it('should reset refresh promise after error', async () => {
    provider.acquireTokenMock.mockRejectedValue(new Error('Acquire failed'));

    await expect(provider.refresh()).rejects.toThrow('Acquire failed');

    // Should be able to call refresh again
    provider.acquireTokenMock.mockResolvedValue(undefined);
    await expect(provider.refresh()).resolves.not.toThrow();

    expect(provider.acquireTokenMock).toHaveBeenCalledTimes(2);
  });
});
