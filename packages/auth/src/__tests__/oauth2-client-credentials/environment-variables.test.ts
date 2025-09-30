import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials';
import type { OAuth2ClientCredentialsConfigZod } from '../../schemas.js';
import type { ITokenStorage } from '@mcp-funnel/core';
import {
  mockFetch,
  createMockStorage,
  setupSuccessfulTokenResponse,
} from './test-utils.js';

describe('OAuth2ClientCredentialsProvider - Environment Variable Resolution', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock storage
    mockStorage = createMockStorage();

    // Setup successful token response by default
    setupSuccessfulTokenResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
