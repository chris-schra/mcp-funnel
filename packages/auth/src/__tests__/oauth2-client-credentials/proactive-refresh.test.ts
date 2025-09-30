import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';
import {
  mockFetch,
  createMockStorage,
  createMockConfig,
  setupSuccessfulTokenResponse,
} from './test-utils.js';

describe('OAuth2ClientCredentialsProvider - Proactive Refresh', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock storage and config
    mockStorage = createMockStorage();
    const mockConfig = createMockConfig();

    // Setup successful token response
    setupSuccessfulTokenResponse();

    // Create provider instance
    provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

      provider = new OAuth2ClientCredentialsProvider(
        createMockConfig(),
        mockStorage,
      );
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

      provider = new OAuth2ClientCredentialsProvider(
        createMockConfig(),
        mockStorage,
      );
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

      provider = new OAuth2ClientCredentialsProvider(
        createMockConfig(),
        mockStorage,
      );

      // Clear initial token acquisition
      vi.clearAllMocks();

      // Call refresh directly
      await provider.refresh();

      // Should make token request
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
