import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  AUTH_DEFAULT_EXPIRY_SECONDS,
  AUTH_MAX_RETRIES,
} from '../utils/index.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
} from '../errors/authentication-error.js';
import {
  TestOAuthProvider,
  MockTokenStorage,
  createTestTokenResponse,
} from './base-oauth-provider-test-helpers.js';

// Mock the logger module
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

describe('BaseOAuthProvider - Token Retry and Processing', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  describe('requestTokenWithRetry', () => {
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

  describe('processTokenResponse', () => {
    it('should store token and schedule refresh', async () => {
      const tokenResponse = createTestTokenResponse();
      mockStorage.storeMock.mockResolvedValue(undefined);

      await provider.testProcessTokenResponse(tokenResponse, 'test-request-id');

      expect(mockStorage.storeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: tokenResponse.access_token,
          tokenType: tokenResponse.token_type ?? 'Bearer',
          scope: tokenResponse.scope,
        }),
      );
      expect(mockStorage.scheduleRefreshMock).toHaveBeenCalled();
    });

    it('should validate audience when provided', async () => {
      const tokenResponse = createTestTokenResponse({
        audience: 'https://api.example.com',
      });
      const validateAudience = vi.fn().mockReturnValue(true);

      await provider.testProcessTokenResponse(
        tokenResponse,
        'test-request-id',
        validateAudience,
      );

      expect(validateAudience).toHaveBeenCalledWith('https://api.example.com');
      expect(mockStorage.storeMock).toHaveBeenCalled();
    });

    it('should throw error for invalid audience', async () => {
      const tokenResponse = createTestTokenResponse({
        audience: 'https://wrong.example.com',
      });
      const validateAudience = vi.fn().mockReturnValue(false);

      await expect(
        provider.testProcessTokenResponse(
          tokenResponse,
          'test-request-id',
          validateAudience,
        ),
      ).rejects.toThrow(AuthenticationError);
      await expect(
        provider.testProcessTokenResponse(
          tokenResponse,
          'test-request-id',
          validateAudience,
        ),
      ).rejects.toThrow('Audience validation failed');
    });

    it('should continue even if storage fails', async () => {
      const tokenResponse = createTestTokenResponse();
      mockStorage.storeMock.mockRejectedValue(new Error('Storage failed'));

      await expect(
        provider.testProcessTokenResponse(tokenResponse, 'test-request-id'),
      ).resolves.not.toThrow();

      expect(mockStorage.storeMock).toHaveBeenCalled();
    });

    it('should use default expiry when not provided', async () => {
      const tokenResponse = createTestTokenResponse({ expires_in: undefined });

      await provider.testProcessTokenResponse(tokenResponse, 'test-request-id');

      const storedToken = mockStorage.storeMock.mock.calls[0]?.[0];
      expect(storedToken.expiresAt.getTime()).toBeCloseTo(
        Date.now() + AUTH_DEFAULT_EXPIRY_SECONDS * 1000,
        -3,
      );
    });

    it('should skip audience validation when not provided', async () => {
      const tokenResponse = createTestTokenResponse({ audience: undefined });
      const validateAudience = vi.fn();

      await provider.testProcessTokenResponse(
        tokenResponse,
        'test-request-id',
        validateAudience,
      );

      expect(validateAudience).not.toHaveBeenCalled();
      expect(mockStorage.storeMock).toHaveBeenCalled();
    });
  });
});
