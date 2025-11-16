import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials.js';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';
import { createMockStorage, createMockConfig, setupSuccessfulTokenResponse } from './test-utils.js';

describe('OAuth2ClientCredentialsProvider - isValid Method', () => {
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

  it('should return true for valid non-expired token', async () => {
    const validToken: TokenData = {
      accessToken: 'valid-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 3600000),
      scope: 'api:read api:write',
    };

    vi.mocked(mockStorage.retrieve).mockResolvedValue(validToken);
    vi.mocked(mockStorage.isExpired).mockResolvedValue(false);

    provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);
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

    provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);
    const isValid = await provider.isValid();

    expect(isValid).toBe(false);
  });

  it('should return false when no token exists', async () => {
    vi.mocked(mockStorage.retrieve).mockResolvedValue(null);

    provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);
    const isValid = await provider.isValid();

    expect(isValid).toBe(false);
  });

  it('should handle storage errors in isValid check', async () => {
    vi.mocked(mockStorage.retrieve).mockRejectedValue(new Error('Storage error'));

    provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);
    const isValid = await provider.isValid();

    // Should return false on storage errors
    expect(isValid).toBe(false);
  });
});
