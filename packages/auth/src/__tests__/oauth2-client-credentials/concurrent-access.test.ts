import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';
import {
  mockFetch,
  createMockStorage,
  createMockConfig,
  setupSuccessfulTokenResponse,
} from './test-utils.js';

describe('OAuth2ClientCredentialsProvider - Concurrent Access', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock storage and config
    mockStorage = createMockStorage();

    // Mock successful token response
    setupSuccessfulTokenResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent token requests safely', async () => {
      vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
      vi.mocked(mockStorage.isExpired).mockResolvedValue(true);

      provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);

      // Make multiple concurrent requests
      const promises = [provider.getHeaders(), provider.getHeaders(), provider.getHeaders()];

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

      provider = new OAuth2ClientCredentialsProvider(createMockConfig(), mockStorage);

      // Make multiple concurrent refresh calls
      const promises = [provider.refresh(), provider.refresh(), provider.refresh()];

      await Promise.all(promises);

      // Should only make one token request despite concurrent refresh calls
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
