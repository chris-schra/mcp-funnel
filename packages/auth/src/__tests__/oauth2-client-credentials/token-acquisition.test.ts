import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials.js';
import type { ITokenStorage } from '@mcp-funnel/core';
import {
  mockFetch,
  createMockStorage,
  createMockConfig,
  setupSuccessfulTokenResponse,
  setupErrorTokenResponse,
  type OAuth2TokenResponse,
} from './test-utils.js';
import type { OAuth2ClientCredentialsConfigZod } from '../../schemas.js';

describe('OAuth2ClientCredentialsProvider - Token Acquisition', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;
  let mockConfig: OAuth2ClientCredentialsConfigZod;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock storage
    mockStorage = createMockStorage();

    // Standard OAuth2 client credentials configuration
    mockConfig = createMockConfig();

    // Mock successful token response
    setupSuccessfulTokenResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const minimalConfig: OAuth2ClientCredentialsConfigZod = createMockConfig({
      scope: undefined,
      audience: undefined,
    });

    vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
    vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

    provider = new OAuth2ClientCredentialsProvider(minimalConfig, mockStorage);
    await provider.getHeaders();

    // Should not include scope or audience in request body
    expect(mockFetch).toHaveBeenCalledWith(
      'https://auth.example.com/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`,
          'X-Request-ID': expect.stringMatching(/^\d{13}_[a-f0-9]{8}$/), // UUID pattern
        },
        body: 'grant_type=client_credentials',
      },
    );
  });

  it('should handle token acquisition failure', async () => {
    vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
    vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

    // Mock OAuth2 error response
    setupErrorTokenResponse(400, {
      error: 'invalid_client',
      error_description: 'Client authentication failed',
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
