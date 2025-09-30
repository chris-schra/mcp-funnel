import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials.js';
import {
  mockFetch,
  createMockStorage,
  createMockConfig,
  setupSuccessfulTokenResponse,
} from './test-utils.js';
import type { ITokenStorage } from '@mcp-funnel/core';
import type { OAuth2ClientCredentialsConfigZod } from '../../schemas.js';

describe('Message Correlation', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;
  let mockConfig: OAuth2ClientCredentialsConfigZod;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    mockConfig = createMockConfig();
    setupSuccessfulTokenResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
