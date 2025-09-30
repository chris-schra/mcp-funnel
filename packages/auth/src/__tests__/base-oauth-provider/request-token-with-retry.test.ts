import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TestOAuthProvider,
  MockTokenStorage,
  createTestTokenResponse,
} from './test-utils.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
} from '../../errors/authentication-error.js';
import { AUTH_MAX_RETRIES } from '../../utils/index.js';

describe('BaseOAuthProvider - requestTokenWithRetry', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should return token response on first successful attempt', async () => {
    const tokenResponse = createTestTokenResponse();
    const makeRequest = vi.fn().mockResolvedValue(tokenResponse);

    const result = await provider.testRequestTokenWithRetry(
      makeRequest,
      'test-request-id',
    );

    expect(result).toEqual(tokenResponse);
    expect(makeRequest).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable network errors', async () => {
    const tokenResponse = createTestTokenResponse();
    const networkError = new Error('ECONNRESET: Connection reset by peer');
    const makeRequest = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue(tokenResponse);

    const result = await provider.testRequestTokenWithRetry(
      makeRequest,
      'test-request-id',
    );

    expect(result).toEqual(tokenResponse);
    expect(makeRequest).toHaveBeenCalledTimes(3);
  });

  it('should not retry on authentication errors', async () => {
    const authError = new AuthenticationError(
      'Invalid client',
      OAuth2ErrorCode.INVALID_CLIENT,
    );
    const makeRequest = vi.fn().mockRejectedValue(authError);

    await expect(
      provider.testRequestTokenWithRetry(makeRequest, 'test-request-id'),
    ).rejects.toThrow(authError);

    expect(makeRequest).toHaveBeenCalledTimes(1);
  });

  it('should throw error after maximum retries exceeded', async () => {
    const networkError = new Error('ETIMEDOUT: Connection timed out');
    const makeRequest = vi.fn().mockRejectedValue(networkError);

    await expect(
      provider.testRequestTokenWithRetry(makeRequest, 'test-request-id'),
    ).rejects.toThrow(networkError);

    expect(makeRequest).toHaveBeenCalledTimes(AUTH_MAX_RETRIES);
  });

  it('should use exponential backoff for retries', async () => {
    const networkError = new Error('ECONNREFUSED: Connection refused');
    const makeRequest = vi.fn().mockRejectedValue(networkError);

    // Mock setTimeout to capture delay values
    const originalSetTimeout = global.setTimeout;
    const setTimeoutMock = vi.fn().mockImplementation((fn, _delay) => {
      fn(); // Execute immediately for testing
      return {} as NodeJS.Timeout;
    });
    global.setTimeout = setTimeoutMock as never;

    try {
      await expect(
        provider.testRequestTokenWithRetry(makeRequest, 'test-request-id'),
      ).rejects.toThrow(networkError);

      // Check exponential backoff delays: 1000ms, 2000ms
      expect(setTimeoutMock).toHaveBeenCalledTimes(2);
      expect(setTimeoutMock).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        1000,
      );
      expect(setTimeoutMock).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        2000,
      );
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  it('should handle non-Error objects thrown', async () => {
    const stringError = 'String error';
    const makeRequest = vi.fn().mockRejectedValue(stringError);

    await expect(
      provider.testRequestTokenWithRetry(makeRequest, 'test-request-id'),
    ).rejects.toThrow('String error');

    expect(makeRequest).toHaveBeenCalledTimes(1);
  });
});
