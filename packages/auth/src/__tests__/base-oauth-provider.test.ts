import { describe, it, expect, beforeEach, vi } from 'vitest';

import { BaseOAuthProvider } from '../implementations/base-oauth-provider.js';
import {
  AUTH_DEFAULT_EXPIRY_SECONDS,
  AUTH_MAX_RETRIES,
  type OAuth2TokenResponse,
} from '../utils/index.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
} from '../errors/authentication-error.js';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';

// Mock the logger module
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

// Mock implementation of BaseOAuthProvider for testing
class TestOAuthProvider extends BaseOAuthProvider {
  public acquireTokenMock = vi.fn(() => Promise.resolve());
  public makeTokenRequestMock = vi.fn(() =>
    Promise.resolve({} as OAuth2TokenResponse),
  );

  constructor(storage: ITokenStorage) {
    super(storage);
  }

  protected async acquireToken(): Promise<void> {
    return this.acquireTokenMock();
  }

  // Expose protected methods for testing
  public async testEnsureValidToken(): Promise<TokenData> {
    return this.ensureValidToken();
  }

  public async testRequestTokenWithRetry(
    makeTokenRequest: () => Promise<OAuth2TokenResponse>,
    requestId: string,
  ): Promise<OAuth2TokenResponse> {
    return this.requestTokenWithRetry(makeTokenRequest, requestId);
  }

  public async testProcessTokenResponse(
    tokenResponse: OAuth2TokenResponse,
    requestId: string,
    validateAudience?: (audience: string) => boolean,
  ): Promise<void> {
    return this.processTokenResponse(
      tokenResponse,
      requestId,
      validateAudience,
    );
  }

  public async testHandleTokenRequestError(
    error: unknown,
    response?: Response,
  ): Promise<never> {
    return this.handleTokenRequestError(error, response);
  }

  public testValidateTokenResponse(tokenResponse: OAuth2TokenResponse): void {
    return this.validateTokenResponse(tokenResponse);
  }

  public testGenerateRequestId(): string {
    return this.generateRequestId();
  }
}

// Mock token storage implementation
class MockTokenStorage implements ITokenStorage {
  private token: TokenData | null = null;
  private refreshCallback?: () => Promise<void> | void;

  public storeMock = vi.fn();
  public retrieveMock = vi.fn();
  public isExpiredMock = vi.fn();
  public clearMock = vi.fn();
  public scheduleRefreshMock = vi.fn();

  async store(token: TokenData): Promise<void> {
    this.token = token;
    return this.storeMock(token);
  }

  async retrieve(): Promise<TokenData | null> {
    const result = await this.retrieveMock();
    return result ?? this.token;
  }

  async isExpired(): Promise<boolean> {
    return this.isExpiredMock();
  }

  async clear(): Promise<void> {
    this.token = null;
    return this.clearMock();
  }

  scheduleRefresh(callback: () => Promise<void> | void): void {
    this.refreshCallback = callback;
    this.scheduleRefreshMock(callback);
  }

  // Helper methods for testing
  setToken(token: TokenData | null): void {
    this.token = token;
  }

  async triggerRefreshCallback(): Promise<void> {
    if (this.refreshCallback) {
      await this.refreshCallback();
    }
  }
}

// Helper to create test token data
/**
 *
 * @param expiresInMs
 */
function createTestToken(expiresInMs: number = 3600000): TokenData {
  return {
    accessToken:
      'test-access-token-' + Math.random().toString(36).substring(2, 11),
    expiresAt: new Date(Date.now() + expiresInMs),
    tokenType: 'Bearer',
    scope: 'read write',
  };
}

// Helper to create test OAuth2 token response
/**
 *
 * @param overrides
 */
function createTestTokenResponse(
  overrides: Partial<OAuth2TokenResponse> = {},
): OAuth2TokenResponse {
  return {
    access_token: 'test-token-' + Math.random().toString(36).substring(2, 11),
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'read write',
    ...overrides,
  };
}

describe('BaseOAuthProvider', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  describe('getHeaders', () => {
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

  describe('isValid', () => {
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

  describe('refresh', () => {
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

  describe('ensureValidToken', () => {
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

  describe('handleTokenRequestError', () => {
    it('should re-throw AuthenticationError directly', async () => {
      const authError = new AuthenticationError(
        'Test error',
        OAuth2ErrorCode.INVALID_CLIENT,
      );

      await expect(
        provider.testHandleTokenRequestError(authError),
      ).rejects.toThrow(authError);
    });

    it('should handle HTTP error responses', async () => {
      const errorResponse = {
        error: 'invalid_request',
        error_description: 'Missing parameter',
      };

      const mockResponse = {
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue(errorResponse),
      } as unknown as Response;

      await expect(
        provider.testHandleTokenRequestError('Fetch failed', mockResponse),
      ).rejects.toThrow(AuthenticationError);
    });

    it('should handle JSON parsing errors', async () => {
      const syntaxError = new SyntaxError('Unexpected token');

      await expect(
        provider.testHandleTokenRequestError(syntaxError),
      ).rejects.toThrow(AuthenticationError);
      await expect(
        provider.testHandleTokenRequestError(syntaxError),
      ).rejects.toThrow('Failed to parse OAuth2 token response');
    });

    it('should handle generic fetch errors', async () => {
      const fetchError = new Error('Network error');

      await expect(
        provider.testHandleTokenRequestError(fetchError),
      ).rejects.toThrow(AuthenticationError);
      await expect(
        provider.testHandleTokenRequestError(fetchError),
      ).rejects.toThrow('Network error during authentication');
    });

    it('should handle non-Error objects', async () => {
      const stringError = 'String error';

      await expect(
        provider.testHandleTokenRequestError(stringError),
      ).rejects.toThrow(AuthenticationError);
      await expect(
        provider.testHandleTokenRequestError(stringError),
      ).rejects.toThrow('Network error during authentication: String error');
    });
  });

  describe('validateTokenResponse', () => {
    it('should pass for valid token response', () => {
      const tokenResponse = createTestTokenResponse();

      expect(() =>
        provider.testValidateTokenResponse(tokenResponse),
      ).not.toThrow();
    });

    it('should throw error for missing access_token', () => {
      const tokenResponse = {
        ...createTestTokenResponse(),
        access_token: '',
      };

      expect(() => provider.testValidateTokenResponse(tokenResponse)).toThrow(
        AuthenticationError,
      );
      expect(() => provider.testValidateTokenResponse(tokenResponse)).toThrow(
        'OAuth2 token response missing access_token field',
      );
    });

    it('should throw error for undefined access_token', () => {
      const tokenResponse = createTestTokenResponse();
      delete (tokenResponse as Partial<OAuth2TokenResponse>).access_token;

      expect(() => provider.testValidateTokenResponse(tokenResponse)).toThrow(
        AuthenticationError,
      );
    });
  });

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = provider.testGenerateRequestId();
      const id2 = provider.testGenerateRequestId();

      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
      expect(id2.length).toBeGreaterThan(0);
    });

    it('should generate correct format', () => {
      const id = provider.testGenerateRequestId();

      const uuidRegex = /^\d{13}_[a-f0-9]{8}$/i;
      expect(id).toMatch(uuidRegex);
    });
  });

  describe('Proactive Refresh Scheduling', () => {
    it('should schedule refresh for tokens with sufficient time', async () => {
      const token = createTestToken(3600000); // 1 hour
      mockStorage.setToken(token);
      mockStorage.isExpiredMock.mockResolvedValue(false);

      await provider.testEnsureValidToken();

      expect(mockStorage.scheduleRefreshMock).toHaveBeenCalled();
      const callback = mockStorage.scheduleRefreshMock.mock.calls[0][0];
      expect(typeof callback).toBe('function');
    });

    it('should not schedule refresh for tokens expiring soon', async () => {
      const token = createTestToken(60000); // 1 minute (less than 5 minute buffer)
      mockStorage.setToken(token);
      mockStorage.isExpiredMock.mockResolvedValue(false);

      await provider.testEnsureValidToken();

      // ScheduleRefresh should NOT be called because refresh time would be in the past
      expect(mockStorage.scheduleRefreshMock).not.toHaveBeenCalled();
    });

    it('should handle refresh callback errors gracefully', async () => {
      const token = createTestToken(3600000);
      mockStorage.setToken(token);
      mockStorage.isExpiredMock.mockResolvedValue(false);

      // Mock refresh to fail
      provider.acquireTokenMock.mockRejectedValue(new Error('Refresh failed'));

      await provider.testEnsureValidToken();

      // Simulate proactive refresh callback
      await expect(mockStorage.triggerRefreshCallback()).resolves.not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
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
      expect(headers3.Authorization).toBe(
        `Bearer ${refreshedToken.accessToken}`,
      );
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
});
