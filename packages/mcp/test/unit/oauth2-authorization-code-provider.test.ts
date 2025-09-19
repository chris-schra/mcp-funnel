import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TokenData, ITokenStorage } from '../../src/auth/index.js';
import { OAuth2AuthCodeProvider } from '../../src/auth/index.js';
import type { OAuth2AuthCodeConfig } from '../../src/types/auth.types.js';

// Mock fetch globally for OAuth2 token requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OAuth2AuthCodeProvider', () => {
  let provider: OAuth2AuthCodeProvider;
  let mockStorage: ITokenStorage;
  let mockConfig: OAuth2AuthCodeConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a simple in-memory storage for mocking
    let storedToken: TokenData | null = null;

    mockStorage = {
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
    } as ITokenStorage;

    mockConfig = {
      type: 'oauth2-code',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      authorizationEndpoint: 'https://auth.example.com/oauth/authorize',
      tokenEndpoint: 'https://auth.example.com/oauth/token',
      redirectUri: 'http://localhost:3456/api/oauth/callback',
      scope: 'read write',
      audience: 'https://api.example.com',
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with valid configuration', () => {
      expect(() => {
        provider = new OAuth2AuthCodeProvider(mockConfig, mockStorage);
      }).not.toThrow();
    });

    it('should throw error for missing client ID', () => {
      const invalidConfig = { ...mockConfig, clientId: '' };
      expect(() => {
        new OAuth2AuthCodeProvider(invalidConfig, mockStorage);
      }).toThrow('OAuth2 client ID is required');
    });

    it('should throw error for missing auth URL', () => {
      const invalidConfig = { ...mockConfig, authorizationEndpoint: '' };
      expect(() => {
        new OAuth2AuthCodeProvider(invalidConfig, mockStorage);
      }).toThrow('OAuth2 authorization URL is required');
    });

    it('should throw error for missing token URL', () => {
      const invalidConfig = { ...mockConfig, tokenEndpoint: '' };
      expect(() => {
        new OAuth2AuthCodeProvider(invalidConfig, mockStorage);
      }).toThrow('OAuth2 token URL is required');
    });

    it('should throw error for missing redirect URI', () => {
      const invalidConfig = { ...mockConfig, redirectUri: '' };
      expect(() => {
        new OAuth2AuthCodeProvider(invalidConfig, mockStorage);
      }).toThrow('OAuth2 redirect URI is required');
    });

    it('should throw error for invalid URLs', () => {
      const invalidConfig = {
        ...mockConfig,
        authorizationEndpoint: 'not-a-url',
      };
      expect(() => {
        new OAuth2AuthCodeProvider(invalidConfig, mockStorage);
      }).toThrow('OAuth2 URLs must be valid URLs');
    });

    it('should resolve environment variables in config', () => {
      process.env.TEST_CLIENT_ID = 'env-client-id';
      const envConfig = { ...mockConfig, clientId: '${TEST_CLIENT_ID}' };

      expect(() => {
        provider = new OAuth2AuthCodeProvider(envConfig, mockStorage);
      }).not.toThrow();

      delete process.env.TEST_CLIENT_ID;
    });

    it('should throw error for missing environment variables', () => {
      const envConfig = { ...mockConfig, clientId: '${MISSING_VAR}' };
      expect(() => {
        new OAuth2AuthCodeProvider(envConfig, mockStorage);
      }).toThrow('Environment variable MISSING_VAR is not set');
    });
  });

  describe('isValid', () => {
    beforeEach(() => {
      provider = new OAuth2AuthCodeProvider(mockConfig, mockStorage);
    });

    it('should return false when no token is stored', async () => {
      mockStorage.retrieve = vi.fn().mockResolvedValue(null);
      expect(await provider.isValid()).toBe(false);
    });

    it('should return false when token is expired', async () => {
      const expiredToken: TokenData = {
        accessToken: 'token',
        expiresAt: new Date(Date.now() - 1000),
        tokenType: 'Bearer',
      };
      mockStorage.retrieve = vi.fn().mockResolvedValue(expiredToken);
      mockStorage.isExpired = vi.fn().mockResolvedValue(true);

      expect(await provider.isValid()).toBe(false);
    });

    it('should return true when token is valid', async () => {
      const validToken: TokenData = {
        accessToken: 'token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };
      mockStorage.retrieve = vi.fn().mockResolvedValue(validToken);
      mockStorage.isExpired = vi.fn().mockResolvedValue(false);

      expect(await provider.isValid()).toBe(true);
    });

    it('should return false on storage error', async () => {
      mockStorage.retrieve = vi
        .fn()
        .mockRejectedValue(new Error('Storage error'));
      expect(await provider.isValid()).toBe(false);
    });
  });

  describe('completeOAuthFlow', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      provider = new OAuth2AuthCodeProvider(mockConfig, mockStorage);
      consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should throw error when no pending authorization', async () => {
      await expect(
        provider.completeOAuthFlow('test-state', 'test-code'),
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should throw error for invalid state parameter', async () => {
      // Start OAuth flow to create pending auth
      const initPromise = provider.refresh();

      // Try to complete with wrong state
      await expect(
        provider.completeOAuthFlow('wrong-state', 'test-code'),
      ).rejects.toThrow('Invalid or expired OAuth state');

      // Clean up
      initPromise.catch(() => {}); // Prevent unhandled rejection
    });

    it('should complete OAuth flow successfully', async () => {
      // Mock successful token response
      const mockTokenResponse = {
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read write',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      // Start OAuth flow to create pending auth
      const refreshPromise = provider.refresh();

      // Simulate waiting a bit for the auth URL to be logged
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Extract state from console output
      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');

      const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
      expect(stateMatch).toBeTruthy();
      const state = stateMatch![1];

      // Complete OAuth flow
      await provider.completeOAuthFlow(state, 'test-code');

      // Wait for refresh to complete
      await refreshPromise;

      // Verify token was stored
      expect(mockStorage.store).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'new-access-token',
          tokenType: 'Bearer',
          scope: 'read write',
        }),
      );
    });

    it('should handle token exchange errors', async () => {
      // Mock token error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        }),
      });

      // Start OAuth flow to create pending auth
      const refreshPromise = provider.refresh();

      // Simulate waiting for auth URL
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Extract state from console output
      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');

      const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
      const state = stateMatch![1];

      // Complete OAuth flow with invalid code - this should resolve but trigger error handling
      await provider.completeOAuthFlow(state, 'invalid-code');

      // The refresh promise should reject with the error
      await expect(refreshPromise).rejects.toThrow(
        'OAuth2 authentication failed: invalid_grant',
      );
    });
  });

  describe('getHeaders', () => {
    beforeEach(() => {
      provider = new OAuth2AuthCodeProvider(mockConfig, mockStorage);
    });

    it('should return headers with valid token', async () => {
      const validToken: TokenData = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };

      mockStorage.retrieve = vi.fn().mockResolvedValue(validToken);
      mockStorage.isExpired = vi.fn().mockResolvedValue(false);

      const headers = await provider.getHeaders();
      expect(headers).toEqual({
        Authorization: 'Bearer test-token',
      });
    });

    it('should initiate OAuth flow when no valid token exists', async () => {
      mockStorage.retrieve = vi.fn().mockResolvedValue(null);

      // Start the OAuth flow and expect it to reject due to timeout
      const promise = provider.getHeaders();

      // Wait briefly to ensure the OAuth flow has started
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Force cleanup of pending auth to simulate timeout
      const providerAny = provider as unknown as {
        pendingAuthFlows?: Map<
          string,
          {
            timeout: NodeJS.Timeout;
            reject: (error: Error) => void;
          }
        >;
      };

      if (
        providerAny.pendingAuthFlows &&
        providerAny.pendingAuthFlows.size > 0
      ) {
        // Get the first pending auth flow to simulate timeout
        const [state, pendingAuth] = providerAny.pendingAuthFlows
          .entries()
          .next().value;
        clearTimeout(pendingAuth.timeout);
        pendingAuth.reject(
          new Error('Authorization timeout - please try again'),
        );
        providerAny.pendingAuthFlows.delete(state);
      }

      await expect(promise).rejects.toThrow('Authorization timeout');
    });
  });

  describe('PKCE security', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      provider = new OAuth2AuthCodeProvider(mockConfig, mockStorage);
      consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should generate different PKCE verifier and challenge each time', async () => {
      const states: string[] = [];
      const challenges: string[] = [];

      // Capture multiple OAuth flows
      for (let i = 0; i < 3; i++) {
        // Create a fresh provider for each iteration to ensure clean state
        const freshProvider = new OAuth2AuthCodeProvider(
          mockConfig,
          mockStorage,
        );
        const freshConsoleSpy = vi
          .spyOn(console, 'info')
          .mockImplementation(() => {});

        const refreshPromise = freshProvider.refresh();

        await new Promise((resolve) => setTimeout(resolve, 50));

        const consoleOutput = freshConsoleSpy.mock.calls.flat().join(' ');

        const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
        const challengeMatch = consoleOutput.match(/code_challenge=([^&\s]+)/);

        if (stateMatch && challengeMatch) {
          states.push(stateMatch[1]);
          challenges.push(challengeMatch[1]);
        }

        // Cleanup
        const providerAny = freshProvider as unknown as {
          pendingAuth?: { timeout: NodeJS.Timeout };
        };

        if (providerAny.pendingAuth) {
          clearTimeout(providerAny.pendingAuth.timeout);
          providerAny.pendingAuth = undefined;
        }
        refreshPromise.catch(() => {});

        freshConsoleSpy.mockRestore();
      }

      // Verify all states are unique
      expect(new Set(states).size).toBe(3);

      // Verify all challenges are unique
      expect(new Set(challenges).size).toBe(3);
    });
  });
});
