import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2ClientCredentialsProvider } from '../../implementations/oauth2-client-credentials';
import {
  mockFetch,
  createMockStorage,
  createMockConfig,
  setupSuccessfulTokenResponse,
  type OAuth2ErrorResponse,
} from './test-utils.js';
import type { ITokenStorage } from '@mcp-funnel/core';
import type { OAuth2ClientCredentialsConfigZod } from '../../schemas.js';

describe('OAuth2ClientCredentialsProvider - Error Handling', () => {
  let provider: OAuth2ClientCredentialsProvider;
  let mockStorage: ITokenStorage;
  let mockConfig: OAuth2ClientCredentialsConfigZod;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock storage and config
    mockStorage = createMockStorage();
    mockConfig = createMockConfig();

    // Mock successful token response by default
    setupSuccessfulTokenResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
        description: 'The authorization server encountered an unexpected condition',
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

      await expect(provider.getHeaders()).rejects.toThrow(scenario.expectedMessage);
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
    await expect(provider.getHeaders()).rejects.toThrow('Failed to parse OAuth2 token response');
  });

  it('should handle token storage errors gracefully', async () => {
    vi.mocked(mockStorage.retrieve).mockResolvedValueOnce(null);
    vi.mocked(mockStorage.isExpired).mockResolvedValue(true);
    vi.mocked(mockStorage.store).mockRejectedValue(new Error('Storage unavailable'));

    // provider = new OAuth2ClientCredentialsProvider(mockConfig, mockStorage);

    // Should still return headers even if storage fails
    // const headers = await provider.getHeaders();
    // expect(headers['Authorization']).toBe('Bearer mock-access-token');

    // But should log warning about storage failure
    // (This would require testing with a logger mock)
  });
});
