import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  TestOAuthProvider,
  MockTokenStorage,
  createTestTokenResponse,
} from './test-utils.js';
import { AuthenticationError } from '../../errors/authentication-error.js';
import type { OAuth2TokenResponse } from '../../utils/index.js';

describe('BaseOAuthProvider - validateTokenResponse', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should pass for valid token response', () => {
    const tokenResponse = createTestTokenResponse();

    expect(() =>
      provider.testValidateTokenResponse(tokenResponse),
    ).not.toThrow();
  });

  it('should throw error for missing access_token', () => {
    const tokenResponse = {
      ...createTestTokenResponse(),
      access_token: '',
    };

    expect(() => provider.testValidateTokenResponse(tokenResponse)).toThrow(
      AuthenticationError,
    );
    expect(() => provider.testValidateTokenResponse(tokenResponse)).toThrow(
      'OAuth2 token response missing access_token field',
    );
  });

  it('should throw error for undefined access_token', () => {
    const tokenResponse = createTestTokenResponse();
    delete (tokenResponse as Partial<OAuth2TokenResponse>).access_token;

    expect(() => provider.testValidateTokenResponse(tokenResponse)).toThrow(
      AuthenticationError,
    );
  });
});