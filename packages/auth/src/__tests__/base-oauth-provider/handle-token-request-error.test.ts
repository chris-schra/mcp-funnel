import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestOAuthProvider, MockTokenStorage } from './test-utils.js';
import { AuthenticationError, OAuth2ErrorCode } from '../../errors/authentication-error.js';

/**
 * Tests error handling during token request failures in BaseOAuthProvider.
 * @see {@link BaseOAuthProvider.handleTokenRequestError}
 */
describe('BaseOAuthProvider - handleTokenRequestError', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should re-throw AuthenticationError directly', async () => {
    const authError = new AuthenticationError('Test error', OAuth2ErrorCode.INVALID_CLIENT);

    await expect(provider.testHandleTokenRequestError(authError)).rejects.toThrow(authError);
  });

  it('should handle HTTP error responses', async () => {
    const errorResponse = {
      error: 'invalid_request',
      error_description: 'Missing parameter',
    };

    const mockResponse = {
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue(errorResponse),
    } as unknown as Response;

    await expect(
      provider.testHandleTokenRequestError('Fetch failed', mockResponse),
    ).rejects.toThrow(AuthenticationError);
  });

  it('should handle JSON parsing errors', async () => {
    const syntaxError = new SyntaxError('Unexpected token');

    await expect(provider.testHandleTokenRequestError(syntaxError)).rejects.toThrow(
      AuthenticationError,
    );
    await expect(provider.testHandleTokenRequestError(syntaxError)).rejects.toThrow(
      'Failed to parse OAuth2 token response',
    );
  });

  it('should handle generic fetch errors', async () => {
    const fetchError = new Error('Network error');

    await expect(provider.testHandleTokenRequestError(fetchError)).rejects.toThrow(
      AuthenticationError,
    );
    await expect(provider.testHandleTokenRequestError(fetchError)).rejects.toThrow(
      'Network error during authentication',
    );
  });

  it('should handle non-Error objects', async () => {
    const stringError = 'String error';

    await expect(provider.testHandleTokenRequestError(stringError)).rejects.toThrow(
      AuthenticationError,
    );
    await expect(provider.testHandleTokenRequestError(stringError)).rejects.toThrow(
      'Network error during authentication: String error',
    );
  });
});
