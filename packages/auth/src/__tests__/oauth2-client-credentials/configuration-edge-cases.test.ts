import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials';
import type { OAuth2ClientCredentialsConfigZod } from '../../schemas.js';
import type { ITokenStorage } from '@mcp-funnel/core';
import {
  mockFetch,
  createMockStorage,
  setupSuccessfulTokenResponse,
} from './test-utils.js';

describe('Configuration Edge Cases', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock storage
    mockStorage = createMockStorage();

    // Mock successful token response
    setupSuccessfulTokenResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
