import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TestOAuthProvider,
  MockTokenStorage,
  createTestTokenResponse,
} from './test-utils.js';
import { AuthenticationError } from '../../errors/authentication-error.js';
import { AUTH_DEFAULT_EXPIRY_SECONDS } from '../../utils/index.js';

describe('BaseOAuthProvider - processTokenResponse', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should store token and schedule refresh', async () => {
    const tokenResponse = createTestTokenResponse();
    mockStorage.storeMock.mockResolvedValue(undefined);

    await provider.testProcessTokenResponse(tokenResponse, 'test-request-id');

    expect(mockStorage.storeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: tokenResponse.access_token,
        tokenType: tokenResponse.token_type ?? 'Bearer',
        scope: tokenResponse.scope,
      }),
    );
    expect(mockStorage.scheduleRefreshMock).toHaveBeenCalled();
  });

  it('should validate audience when provided', async () => {
    const tokenResponse = createTestTokenResponse({
      audience: 'https://api.example.com',
    });
    const validateAudience = vi.fn().mockReturnValue(true);

    await provider.testProcessTokenResponse(
      tokenResponse,
      'test-request-id',
      validateAudience,
    );

    expect(validateAudience).toHaveBeenCalledWith('https://api.example.com');
    expect(mockStorage.storeMock).toHaveBeenCalled();
  });

  it('should throw error for invalid audience', async () => {
    const tokenResponse = createTestTokenResponse({
      audience: 'https://wrong.example.com',
    });
    const validateAudience = vi.fn().mockReturnValue(false);

    await expect(
      provider.testProcessTokenResponse(
        tokenResponse,
        'test-request-id',
        validateAudience,
      ),
    ).rejects.toThrow(AuthenticationError);
    await expect(
      provider.testProcessTokenResponse(
        tokenResponse,
        'test-request-id',
        validateAudience,
      ),
    ).rejects.toThrow('Audience validation failed');
  });

  it('should continue even if storage fails', async () => {
    const tokenResponse = createTestTokenResponse();
    mockStorage.storeMock.mockRejectedValue(new Error('Storage failed'));

    await expect(
      provider.testProcessTokenResponse(tokenResponse, 'test-request-id'),
    ).resolves.not.toThrow();

    expect(mockStorage.storeMock).toHaveBeenCalled();
  });

  it('should use default expiry when not provided', async () => {
    const tokenResponse = createTestTokenResponse({ expires_in: undefined });

    await provider.testProcessTokenResponse(tokenResponse, 'test-request-id');

    const storedToken = mockStorage.storeMock.mock.calls[0]?.[0];
    expect(storedToken.expiresAt.getTime()).toBeCloseTo(
      Date.now() + AUTH_DEFAULT_EXPIRY_SECONDS * 1000,
      -3,
    );
  });

  it('should skip audience validation when not provided', async () => {
    const tokenResponse = createTestTokenResponse({ audience: undefined });
    const validateAudience = vi.fn();

    await provider.testProcessTokenResponse(
      tokenResponse,
      'test-request-id',
      validateAudience,
    );

    expect(validateAudience).not.toHaveBeenCalled();
    expect(mockStorage.storeMock).toHaveBeenCalled();
  });
});
