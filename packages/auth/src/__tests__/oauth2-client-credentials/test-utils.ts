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

// Create mock storage helper
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

// Create standard test configuration
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

// Setup mock fetch for successful token response
export function setupSuccessfulTokenResponse(
  response?: Partial<OAuth2TokenResponse>,
): void {
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

// Setup mock fetch for error response
export function setupErrorTokenResponse(
  status: number,
  error: OAuth2ErrorResponse,
): void {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(error),
  });
}
