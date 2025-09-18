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
      authUrl: 'https://auth.example.com/oauth/authorize',
      tokenUrl: 'https://auth.example.com/oauth/token',
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
      const invalidConfig = { ...mockConfig, authUrl: '' };
      expect(() => {
        new OAuth2AuthCodeProvider(invalidConfig, mockStorage);
      }).toThrow('OAuth2 authorization URL is required');
    });

    it('should throw error for missing token URL', () => {
      const invalidConfig = { ...mockConfig, tokenUrl: '' };
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
      const invalidConfig = { ...mockConfig, authUrl: 'not-a-url' };
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
      consoleSpy = vi.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should throw error when no pending authorization', async () => {
      await expect(
        provider.completeOAuthFlow('test-state', 'test-code'),
      ).rejects.toThrow('No pending authorization found');
    });

    it('should throw error for invalid state parameter', async () => {
      // Start OAuth flow to create pending auth
      const initPromise = provider.refresh();

      // Try to complete with wrong state
      await expect(
        provider.completeOAuthFlow('wrong-state', 'test-code'),
      ).rejects.toThrow('Invalid state parameter');

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

      // Attempt to complete OAuth flow should reject
      await expect(
        provider.completeOAuthFlow(state, 'invalid-code'),
      ).rejects.toThrow('OAuth2 authentication failed: invalid_grant');

      // Wait for refresh to complete (will throw)
      await expect(refreshPromise).rejects.toThrow();
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

      // This will timeout since we don't complete the OAuth flow
      const promise = provider.getHeaders();

      // Let it run for a brief moment then cleanup
      setTimeout(() => {
        // Cleanup any pending auth to prevent timeout
        if ((provider as any).pendingAuth) {
          clearTimeout((provider as any).pendingAuth.timeout);
        }
      }, 100);

      await expect(promise).rejects.toThrow();
    });
  });

  describe('PKCE security', () => {
    beforeEach(() => {
      provider = new OAuth2AuthCodeProvider(mockConfig, mockStorage);
      vi.spyOn(console, 'log').mockImplementation();
    });

    it('should generate different PKCE verifier and challenge each time', async () => {
      const states: string[] = [];
      const challenges: string[] = [];

      // Capture multiple OAuth flows
      for (let i = 0; i < 3; i++) {
        const refreshPromise = provider.refresh();

        await new Promise((resolve) => setTimeout(resolve, 50));

        const consoleOutput = (console.log as any).mock.calls.flat().join(' ');

        const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
        const challengeMatch = consoleOutput.match(/code_challenge=([^&\s]+)/);

        if (stateMatch && challengeMatch) {
          states.push(stateMatch[1]);
          challenges.push(challengeMatch[1]);
        }

        // Cleanup
        if ((provider as any).pendingAuth) {
          clearTimeout((provider as any).pendingAuth.timeout);
        }
        refreshPromise.catch(() => {});

        // Reset console spy
        (console.log as any).mockClear();
      }

      // Verify all states are unique
      expect(new Set(states).size).toBe(3);

      // Verify all challenges are unique
      expect(new Set(challenges).size).toBe(3);
    });
  });
});
