import { vi } from 'vitest';
import type { OAuth2ClientCredentialsConfigZod } from '../../schemas.js';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';

// Mock fetch globally for OAuth2 token requests
export const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock OAuth2 token response
export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// Mock OAuth2 error response
export interface OAuth2ErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Creates a mock token storage implementation for testing.
 *
 * @returns Mock storage with vitest-mocked methods
 */
export function createMockStorage(): ITokenStorage {
  let storedToken: TokenData | null = null;

  return {
    store: vi.fn().mockImplementation((token: TokenData) => {
      storedToken = token;
      return Promise.resolve();
    }),
    retrieve: vi.fn().mockImplementation(() => Promise.resolve(storedToken)),
    clear: vi.fn().mockImplementation(() => {
      storedToken = null;
      return Promise.resolve();
    }),
    isExpired: vi.fn(),
    scheduleRefresh: vi.fn(),
  } as ITokenStorage;
}

/**
 * Creates a standard OAuth2 client credentials configuration for testing.
 *
 * @param overrides - Optional configuration values to override defaults
 * @returns OAuth2 client credentials configuration
 */
export function createMockConfig(
  overrides?: Partial<OAuth2ClientCredentialsConfigZod>,
): OAuth2ClientCredentialsConfigZod {
  return {
    type: 'oauth2-client',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    tokenEndpoint: 'https://auth.example.com/oauth/token',
    scope: 'api:read api:write',
    audience: 'https://api.example.com',
    ...overrides,
  };
}

/**
 * Configures the global fetch mock to return a successful OAuth2 token response.
 *
 * @param response - Optional response fields to override default values
 */
export function setupSuccessfulTokenResponse(response?: Partial<OAuth2TokenResponse>): void {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'api:read api:write',
        ...response,
      } as OAuth2TokenResponse),
  });
}

/**
 * Configures the global fetch mock to return an OAuth2 error response.
 *
 * @param status - HTTP status code for the error response
 * @param error - OAuth2 error object with error code and description
 */
export function setupErrorTokenResponse(status: number, error: OAuth2ErrorResponse): void {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(error),
  });
}
