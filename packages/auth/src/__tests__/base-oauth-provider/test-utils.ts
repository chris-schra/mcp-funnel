import { vi } from 'vitest';
import { BaseOAuthProvider } from '../../implementations/base-oauth-provider.js';
import type { OAuth2TokenResponse } from '../../utils/index.js';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';

// Mock the logger module
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

// Mock implementation of BaseOAuthProvider for testing
export class TestOAuthProvider extends BaseOAuthProvider {
  public acquireTokenMock = vi.fn(() => Promise.resolve());
  public makeTokenRequestMock = vi.fn(() => Promise.resolve({} as OAuth2TokenResponse));

  constructor(storage: ITokenStorage) {
    super(storage);
  }

  protected async acquireToken(): Promise<void> {
    return this.acquireTokenMock();
  }

  // Expose protected methods for testing
  public async testEnsureValidToken(): Promise<TokenData> {
    return this.ensureValidToken();
  }

  public async testRequestTokenWithRetry(
    makeTokenRequest: () => Promise<OAuth2TokenResponse>,
    requestId: string,
  ): Promise<OAuth2TokenResponse> {
    return this.requestTokenWithRetry(makeTokenRequest, requestId);
  }

  public async testProcessTokenResponse(
    tokenResponse: OAuth2TokenResponse,
    requestId: string,
    validateAudience?: (audience: string) => boolean,
  ): Promise<void> {
    return this.processTokenResponse(tokenResponse, requestId, validateAudience);
  }

  public async testHandleTokenRequestError(error: unknown, response?: Response): Promise<never> {
    return this.handleTokenRequestError(error, response);
  }

  public testValidateTokenResponse(tokenResponse: OAuth2TokenResponse): void {
    return this.validateTokenResponse(tokenResponse);
  }

  public testGenerateRequestId(): string {
    return this.generateRequestId();
  }
}

// Mock token storage implementation
export class MockTokenStorage implements ITokenStorage {
  private token: TokenData | null = null;
  private refreshCallback?: () => Promise<void> | void;

  public storeMock = vi.fn();
  public retrieveMock = vi.fn();
  public isExpiredMock = vi.fn();
  public clearMock = vi.fn();
  public scheduleRefreshMock = vi.fn();

  async store(token: TokenData): Promise<void> {
    this.token = token;
    return this.storeMock(token);
  }

  async retrieve(): Promise<TokenData | null> {
    const result = await this.retrieveMock();
    return result ?? this.token;
  }

  async isExpired(): Promise<boolean> {
    return this.isExpiredMock();
  }

  async clear(): Promise<void> {
    this.token = null;
    return this.clearMock();
  }

  scheduleRefresh(callback: () => Promise<void> | void): void {
    this.refreshCallback = callback;
    this.scheduleRefreshMock(callback);
  }

  // Helper methods for testing
  setToken(token: TokenData | null): void {
    this.token = token;
  }

  async triggerRefreshCallback(): Promise<void> {
    if (this.refreshCallback) {
      await this.refreshCallback();
    }
  }
}

// Helper to create test token data
/**
 * Creates a test token with the specified expiration time.
 *
 * @param expiresInMs - Time in milliseconds until token expires
 * @returns Test token data
 */
export function createTestToken(expiresInMs: number = 3600000): TokenData {
  return {
    accessToken: 'test-access-token-' + Math.random().toString(36).substring(2, 11),
    expiresAt: new Date(Date.now() + expiresInMs),
    tokenType: 'Bearer',
    scope: 'read write',
  };
}

// Helper to create test OAuth2 token response
/**
 * Creates a test OAuth2 token response with optional overrides.
 *
 * @param overrides - Partial token response properties to override defaults
 * @returns OAuth2 token response
 */
export function createTestTokenResponse(
  overrides: Partial<OAuth2TokenResponse> = {},
): OAuth2TokenResponse {
  return {
    access_token: 'test-token-' + Math.random().toString(36).substring(2, 11),
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'read write',
    ...overrides,
  };
}
