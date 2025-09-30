import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  AuthenticationError,
  OAuth2ErrorCode,
} from '../errors/authentication-error.js';
import type { ITokenStorage } from '@mcp-funnel/core';
import {
  TestOAuthProvider,
  MockTokenStorage,
  createTestToken,
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
});
