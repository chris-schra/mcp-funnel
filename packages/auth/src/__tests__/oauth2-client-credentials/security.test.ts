import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials.js';
import type { OAuth2ClientCredentialsConfigZod } from '../../schemas.js';
import type { ITokenStorage } from '@mcp-funnel/core';
import {
  mockFetch,
  createMockStorage,
  createMockConfig,
  setupSuccessfulTokenResponse,
} from './test-utils.js';

describe('Security', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;
  let mockConfig: OAuth2ClientCredentialsConfigZod;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock storage and config
    mockStorage = createMockStorage();
    mockConfig = createMockConfig();

    // Setup successful token response
    setupSuccessfulTokenResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
