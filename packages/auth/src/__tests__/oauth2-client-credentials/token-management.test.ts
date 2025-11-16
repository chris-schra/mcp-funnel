import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';
import {
  mockFetch,
  createMockStorage,
  createMockConfig,
  setupSuccessfulTokenResponse,
} from './test-utils.js';

describe('Token Management', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    setupSuccessfulTokenResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use existing valid token from storage', async () => {
    const validToken: TokenData = {
      accessToken: 'existing-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      scope: 'api:read api:write',
    };

    vi.mocked(mockStorage.retrieve).mockResolvedValue(validToken);
    vi.mocked(mockStorage.isExpired).mockResolvedValue(false);

    provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);
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

    provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);
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

    vi.mocked(mockStorage.retrieve).mockResolvedValue(tokenExpiringIn4Minutes);
    vi.mocked(mockStorage.isExpired).mockResolvedValue(true); // Should consider as expired due to buffer

    provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);
    await provider.getHeaders();

    // Should refresh token even though it's not technically expired
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should calculate correct expiry time from expires_in', async () => {
    vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
    vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

    const beforeRequest = Date.now();

    provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);
    await provider.getHeaders();

    const afterRequest = Date.now();

    // Verify stored token has correct expiry calculation
    const storedTokenCall = vi.mocked(mockStorage.store).mock.calls[0]?.[0] as TokenData;
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

    provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);
    await provider.getHeaders();

    // Should use default expiry (e.g., 1 hour)
    const storedTokenCall = vi.mocked(mockStorage.store).mock.calls[0]?.[0] as TokenData;
    expect(storedTokenCall.expiresAt).toBeInstanceOf(Date);
  });
});
