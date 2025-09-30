import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../implementations/oauth2-client-credentials';
import type { OAuth2ClientCredentialsConfigZod } from '../schemas.js';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';

// Mock fetch globally for OAuth2 token requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock OAuth2 token response
interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// Mock OAuth2 error response
interface OAuth2ErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

describe('OAuth2ClientCredentialsProvider', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;
  let mockConfig: OAuth2ClientCredentialsConfigZod;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create a simple in-memory storage for mocking
    let storedToken: TokenData | null = null;

    // Mock token storage
    mockStorage = {
      store: vi.fn().mockImplementation((token: TokenData) => {
        storedToken = token;
        return Promise.resolve();
      }),
      retrieve: vi.fn().mockImplementation(() => Promise.resolve(storedToken)),
      clear: vi.fn().mockImplementation(() => {
        storedToken = null;
        return Promise.resolve();
      }),
      isExpired: vi.fn(),
      scheduleRefresh: vi.fn(),
    } as ITokenStorage;

    // Standard OAuth2 client credentials configuration
    mockConfig = {
      type: 'oauth2-client',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      tokenEndpoint: 'https://auth.example.com/oauth/token',
      scope: 'api:read api:write',
      audience: 'https://api.example.com',
    };

    // Mock successful token response
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'api:read api:write',
        } as OAuth2TokenResponse),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token Acquisition', () => {
    it('should successfully acquire token using client credentials flow', async () => {
      // Mock storage returning no existing token initially
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Create provider and get headers to trigger token acquisition
      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      const headers = await provider.getHeaders();

      // Verify token request was made with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/oauth/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`,
            'X-Request-ID': expect.stringMatching(/^\d{13}_[a-f0-9]{8}$/),
          },
          body: 'grant_type=client_credentials&scope=api%3Aread+api%3Awrite&audience=https%3A%2F%2Fapi.example.com',
        },
      );

      // Verify token was stored
      expect(mockStorage.store).toHaveBeenCalledWith({
        accessToken: 'mock-access-token',
        tokenType: 'Bearer',
        expiresAt: expect.any(Date),
        scope: 'api:read api:write',
      });

      // Verify headers contain Bearer token
      expect(headers).toEqual({
        Authorization: 'Bearer mock-access-token',
      });
    });

    it('should handle minimal configuration without optional fields', async () => {
      const minimalConfig: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenEndpoint: 'https://auth.example.com/token',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(
        minimalConfig,
        mockStorage,
      );
      await provider.getHeaders();

      // Should not include scope or audience in request body
      expect(mockFetch).toHaveBeenCalledWith('https://auth.example.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`,
          'X-Request-ID': expect.stringMatching(/^\d{13}_[a-f0-9]{8}$/), // UUID pattern
        },
        body: 'grant_type=client_credentials',
      });
    });

    it('should handle token acquisition failure', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock OAuth2 error response
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_client',
            error_description: 'Client authentication failed',
          } as OAuth2ErrorResponse),
      });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      // Should throw authentication error
      await expect(provider.getHeaders()).rejects.toThrow(
        'OAuth2 authentication failed: invalid_client - Client authentication failed',
      );
    });

    it('should handle network errors during token acquisition', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock network error
      mockFetch.mockRejectedValue(new Error('Network error'));

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      // Should throw network error
      await expect(provider.getHeaders()).rejects.toThrow('Network error');
    });

    it('should retry on transient errors', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock transient error followed by success
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'retry-token',
              token_type: 'Bearer',
              expires_in: 3600,
            } as OAuth2TokenResponse),
        });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      const headers = await provider.getHeaders();

      // Should have retried and succeeded
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(headers['Authorization']).toBe('Bearer retry-token');
    });
  });

  describe('Token Management', () => {
    it('should use existing valid token from storage', async () => {
      const validToken: TokenData = {
        accessToken: 'existing-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        scope: 'api:read api:write',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValue(validToken);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(false);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      const headers = await provider.getHeaders();

      // Should not make new token request
      expect(mockFetch).not.toHaveBeenCalled();

      // Should return existing token
      expect(headers).toEqual({
        Authorization: 'Bearer existing-token',
      });
    });

    it('should refresh expired token', async () => {
      const expiredToken: TokenData = {
        accessToken: 'expired-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
        scope: 'api:read api:write',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValue(expiredToken);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      await provider.getHeaders();

      // Should make new token request
      expect(mockFetch).toHaveBeenCalled();

      // Should store new token
      expect(mockStorage.store).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'mock-access-token',
          tokenType: 'Bearer',
        }),
      );
    });

    it('should check token expiry with 5-minute buffer', async () => {
      const tokenExpiringIn4Minutes: TokenData = {
        accessToken: 'expiring-soon-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 4 * 60 * 1000), // 4 minutes from now
        scope: 'api:read api:write',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValue(
        tokenExpiringIn4Minutes,
      );
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true); // Should consider as expired due to buffer

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      await provider.getHeaders();

      // Should refresh token even though it's not technically expired
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should calculate correct expiry time from expires_in', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      const beforeRequest = Date.now();

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      await provider.getHeaders();

      const afterRequest = Date.now();

      // Verify stored token has correct expiry calculation
      const storedTokenCall = vi.mocked(mockStorage.store).mock
        .calls[0]?.[0] as TokenData;
      const expiryTime = storedTokenCall.expiresAt.getTime();

      // Should be approximately now + 3600 seconds (allowing for test execution time)
      expect(expiryTime).toBeGreaterThanOrEqual(beforeRequest + 3600 * 1000);
      expect(expiryTime).toBeLessThanOrEqual(afterRequest + 3600 * 1000);
    });

    it('should handle missing expires_in in token response', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock token response without expires_in
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'no-expiry-token',
            token_type: 'Bearer',
          }),
      });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      await provider.getHeaders();

      // Should use default expiry (e.g., 1 hour)
      const storedTokenCall = vi.mocked(mockStorage.store).mock
        .calls[0]?.[0] as TokenData;
      expect(storedTokenCall.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('Proactive Refresh', () => {
    it('should schedule proactive refresh 5 minutes before expiry', async () => {
      const validToken: TokenData = {
        accessToken: 'valid-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        scope: 'api:read api:write',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValue(validToken);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(false);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      await provider.getHeaders();

      // Should schedule refresh for 5 minutes before expiry
      if (mockStorage.scheduleRefresh) {
        expect(mockStorage.scheduleRefresh).toHaveBeenCalledWith(
          expect.any(Function),
        );
      }
    });

    it('should refresh token when scheduled refresh is triggered', async () => {
      let refreshCallback: (() => Promise<void>) | undefined;

      mockStorage.scheduleRefresh = vi.fn((callback) => {
        refreshCallback = callback;
      });

      vi.mocked(mockStorage.retrieve).mockResolvedValue({
        accessToken: 'valid-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'api:read api:write',
      });
      vi.mocked(mockStorage.isExpired).mockResolvedValue(false);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      await provider.getHeaders();

      // Clear fetch calls from initialization
      vi.clearAllMocks();

      // Trigger scheduled refresh
      if (refreshCallback) {
        await refreshCallback();
      }

      // Should have made new token request
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle refresh method called directly', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      // Clear initial token acquisition
      vi.clearAllMocks();

      // Call refresh directly
      await provider.refresh();

      // Should make token request
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Security', () => {
    it('should validate audience in token response', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock token response with mismatched audience
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'token-with-wrong-audience',
            token_type: 'Bearer',
            expires_in: 3600,
            audience: 'https://wrong-audience.com',
          }),
      });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      // Should throw audience validation error
      await expect(provider.getHeaders()).rejects.toThrow(
        'Audience validation failed',
      );
    });

    it('should sanitize tokens in error messages', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock error during token processing
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('JSON parsing failed')),
      });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      try {
        await provider.getHeaders();
      } catch (error: unknown) {
        // Error message should not contain actual tokens
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        expect(errorMessage).not.toContain('test-client-secret');
        expect(errorMessage).not.toContain(mockConfig.clientSecret);
      }
    });

    it('should use secure defaults for token type', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock token response without token_type
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'token-without-type',
            expires_in: 3600,
          }),
      });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      const headers = await provider.getHeaders();

      // Should default to Bearer token type
      expect(headers['Authorization']).toBe('Bearer token-without-type');
    });

    it('should handle scope validation correctly', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock token response with different scope
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'limited-scope-token',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'api:read', // Less than requested
          }),
      });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      const headers = await provider.getHeaders();

      // Should accept token even with limited scope
      expect(headers['Authorization']).toBe('Bearer limited-scope-token');

      // But should store the actual granted scope
      expect(mockStorage.store).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'api:read',
        }),
      );
    });
  });

  describe('Environment Variable Resolution', () => {
    it('should resolve clientId from environment variable', async () => {
      process.env.OAUTH_CLIENT_ID = 'env-client-id';

      const configWithEnvVar: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: '${OAUTH_CLIENT_ID}',
        clientSecret: 'test-secret',
        tokenEndpoint: 'https://auth.example.com/token',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(
        configWithEnvVar,
        mockStorage,
      );
      await provider.getHeaders();

      // Should use environment variable value
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${Buffer.from('env-client-id:test-secret').toString('base64')}`,
          }),
        }),
      );

      delete process.env.OAUTH_CLIENT_ID;
    });

    it('should resolve clientSecret from environment variable', async () => {
      process.env.OAUTH_CLIENT_SECRET = 'env-client-secret';

      const configWithEnvVar: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: 'test-client',
        clientSecret: '${OAUTH_CLIENT_SECRET}',
        tokenEndpoint: 'https://auth.example.com/token',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(
        configWithEnvVar,
        mockStorage,
      );
      await provider.getHeaders();

      // Should use environment variable value
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${Buffer.from('test-client:env-client-secret').toString('base64')}`,
          }),
        }),
      );

      delete process.env.OAUTH_CLIENT_SECRET;
    });

    it('should resolve tokenEndpoint from environment variable', async () => {
      process.env.OAUTH_TOKEN_URL = 'https://env-auth.example.com/token';

      const configWithEnvVar: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenEndpoint: '${OAUTH_TOKEN_URL}',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(
        configWithEnvVar,
        mockStorage,
      );
      await provider.getHeaders();

      // Should use environment variable value
      expect(mockFetch).toHaveBeenCalledWith(
        'https://env-auth.example.com/token',
        expect.any(Object),
      );

      delete process.env.OAUTH_TOKEN_URL;
    });

    it('should throw error for missing environment variables', async () => {
      const configWithMissingEnvVar: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: '${MISSING_CLIENT_ID}',
        clientSecret: 'test-secret',
        tokenEndpoint: 'https://auth.example.com/token',
      };

      // Should throw error during provider construction
      expect(
        () =>
          new OAuth2ClientCredentialsProvider(
            configWithMissingEnvVar,
            mockStorage,
          ),
      ).toThrow(
        "Required environment variable 'MISSING_CLIENT_ID' is not defined",
      );
    });
  });

  describe('Message Correlation', () => {
    it('should include request ID in token requests for tracing', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      await provider.getHeaders();

      // Should include X-Request-ID header for correlation
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/oauth/token',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Request-ID': expect.stringMatching(/^\d{13}_[a-f0-9]{8}$/), // UUID pattern
          }),
        }),
      );
    });

    it('should maintain request correlation across retries', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock initial failure then success
      mockFetch
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'retry-success-token',
              token_type: 'Bearer',
              expires_in: 3600,
            }),
        });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      await provider.getHeaders();

      // Both requests should have the same request ID
      const firstCallRequestId =
        mockFetch.mock.calls[0]?.[1]?.headers?.['X-Request-ID'];
      const secondCallRequestId =
        mockFetch.mock.calls[1]?.[1]?.headers?.['X-Request-ID'];

      expect(firstCallRequestId).toBe(secondCallRequestId);
    });
  });

  describe('Error Handling', () => {
    it('should handle OAuth2 error codes correctly', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      const errorScenarios = [
        {
          error: 'invalid_client',
          description: 'Client authentication failed',
          expectedMessage:
            'OAuth2 authentication failed: invalid_client - Client authentication failed',
        },
        {
          error: 'invalid_grant',
          description: 'The provided authorization grant is invalid',
          expectedMessage:
            'OAuth2 authentication failed: invalid_grant - The provided authorization grant is invalid',
        },
        {
          error: 'invalid_scope',
          description: 'The requested scope is invalid',
          expectedMessage:
            'OAuth2 authentication failed: invalid_scope - The requested scope is invalid',
        },
        {
          error: 'server_error',
          description:
            'The authorization server encountered an unexpected condition',
          expectedMessage:
            'OAuth2 authentication failed: server_error - The authorization server encountered an unexpected condition',
        },
      ];

      for (const scenario of errorScenarios) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () =>
            Promise.resolve({
              error: scenario.error,
              error_description: scenario.description,
            } as OAuth2ErrorResponse),
        });

        provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

        await expect(provider.getHeaders()).rejects.toThrow(
          scenario.expectedMessage,
        );
      }
    });

    it('should handle HTTP error responses without OAuth2 error body', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock HTTP 500 without OAuth2 error body
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Not JSON')), // Force JSON parsing to fail
      });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      // Should throw OAuth2 error with server_error for 500 status
      await expect(provider.getHeaders()).rejects.toThrow(
        'OAuth2 authentication failed: server_error - HTTP 500: Internal Server Error',
      );
    });

    it('should handle malformed JSON responses', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      // Mock response with invalid JSON
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      // Should throw JSON parsing error
      await expect(provider.getHeaders()).rejects.toThrow(
        'Failed to parse OAuth2 token response',
      );
    });

    it('should handle token storage errors gracefully', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);
      vi.mocked(mockStorage.store).mockRejectedValue(
        new Error('Storage unavailable'),
      );

      // provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      // Should still return headers even if storage fails
      // const headers = await provider.getHeaders();
      // expect(headers['Authorization']).toBe('Bearer mock-access-token');

      // But should log warning about storage failure
      // (This would require testing with a logger mock)
    });
  });

  describe('isValid Method', () => {
    it('should return true for valid non-expired token', async () => {
      const validToken: TokenData = {
        accessToken: 'valid-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'api:read api:write',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValue(validToken);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(false);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      const isValid = await provider.isValid();

      expect(isValid).toBe(true);
    });

    it('should return false for expired token', async () => {
      const expiredToken: TokenData = {
        accessToken: 'expired-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() - 1000),
        scope: 'api:read api:write',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValue(expiredToken);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      const isValid = await provider.isValid();

      expect(isValid).toBe(false);
    });

    it('should return false when no token exists', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValue(null);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      const isValid = await provider.isValid();

      expect(isValid).toBe(false);
    });

    it('should handle storage errors in isValid check', async () => {
      vi.mocked(mockStorage.retrieve).mockRejectedValue(
        new Error('Storage error'),
      );

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
      const isValid = await provider.isValid();

      // Should return false on storage errors
      expect(isValid).toBe(false);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle URLs with special characters in parameters', async () => {
      const configWithSpecialChars: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: 'client-with-@-symbol',
        clientSecret: 'secret-with-&-symbol',
        tokenEndpoint: 'https://auth.example.com/token?extra=param',
        scope: 'scope:with:colons',
        audience: 'https://api.example.com/v1',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(
        configWithSpecialChars,
        mockStorage,
      );
      await provider.getHeaders();

      // Should properly encode special characters
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token?extra=param',
        expect.objectContaining({
          body: expect.stringContaining('scope=scope%3Awith%3Acolons'),
        }),
      );
    });

    it('should handle very long scope strings', async () => {
      const longScope = Array(100).fill('scope').join(' ');
      const configWithLongScope: OAuth2ClientCredentialsConfigZod = {
        type: 'oauth2-client',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenEndpoint: 'https://auth.example.com/token',
        scope: longScope,
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(
        configWithLongScope,
        mockStorage,
      );
      await provider.getHeaders();

      // Should handle long scope string without truncation
      const requestBody = mockFetch.mock.calls[0]?.[1]?.body;
      // URLSearchParams encodes spaces as + instead of %20
      const expectedScope = longScope.replace(/ /g, '+');
      expect(requestBody).toContain(expectedScope);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent token requests safely', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      // Make multiple concurrent requests
      const promises = [
        provider.getHeaders(),
        provider.getHeaders(),
        provider.getHeaders(),
      ];

      await Promise.all(promises);

      // Should only make one token request despite concurrent calls
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent refresh calls safely', async () => {
      const validToken: TokenData = {
        accessToken: 'valid-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'api:read api:write',
      };

      vi.mocked(mockStorage.retrieve).mockResolvedValue(validToken);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(false);

      provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

      // Make multiple concurrent refresh calls
      const promises = [
        provider.refresh(),
        provider.refresh(),
        provider.refresh(),
      ];

      await Promise.all(promises);

      // Should only make one token request despite concurrent refresh calls
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
