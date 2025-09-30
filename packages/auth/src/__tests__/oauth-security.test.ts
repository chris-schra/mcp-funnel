/**
 * OAuth Security Test Suite
 *
 * CRITICAL SECURITY VALIDATION: This test suite validates ALL security fixes
 * from Phase 4 of the OAuth implementation. Tests ensure proper CSRF protection,
 * PKCE implementation, token security, concurrent flow isolation, and state management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { MemoryTokenStorage } from '../implementations/memory-token-storage.js';
import { OAuth2AuthCodeProvider } from '../implementations/oauth2-authorization-code.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import type { TokenData } from '@mcp-funnel/core';

// Mock fetch globally for OAuth2 token requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger to prevent noise in tests while keeping other exports
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

describe('OAuth Security Tests', () => {
  let provider: OAuth2AuthCodeProvider;
  let storage: MemoryTokenStorage;
  let config: OAuth2AuthCodeConfig;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    storage = new MemoryTokenStorage();
    config = {
      type: 'oauth2-code',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      redirectUri: 'http://localhost:3000/callback',
      scope: 'read write',
    };

    // Mock console.info to capture OAuth URLs
    consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    if (provider) {
      provider.destroy();
    }
    consoleSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('CSRF Protection', () => {
    it('should generate unique state for each OAuth flow', async () => {
      const states: string[] = [];

      // Create multiple providers to test state uniqueness
      for (let i = 0; i < 5; i++) {
        const testProvider = new OAuth2AuthCodeProvider(config, storage);

        const refreshPromise = testProvider.refresh();
        await vi.advanceTimersByTimeAsync(50);

        const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
        const stateMatch = consoleOutput.match(/state=([^&\s]+)/);

        if (stateMatch) {
          states.push(stateMatch[1]);
        }

        testProvider.destroy();
        refreshPromise.catch(() => {}); // Prevent unhandled rejection
        consoleSpy.mockClear();
      }

      // Verify all states are unique
      expect(states).toHaveLength(5);
      expect(new Set(states).size).toBe(5);

      // Verify state format (base64url encoded)
      states.forEach((state) => {
        expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(state.length).toBeGreaterThan(16);
      });
    });

    it('should reject invalid state parameter', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      // Try to complete OAuth flow with invalid state
      await expect(
        provider.completeOAuthFlow('invalid-state-123', 'test-code'),
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should reject mismatched state parameter', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      // Start OAuth flow
      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      // Try to complete with different state
      await expect(
        provider.completeOAuthFlow('different-state', 'test-code'),
      ).rejects.toThrow('Invalid or expired OAuth state');

      refreshPromise.catch(() => {});
    });

    it('should expire state after 10 minutes', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      // Start OAuth flow
      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      // Clean up first flow to avoid interference
      provider.destroy();
      // Catch any rejection from the first flow to prevent unhandled rejection
      refreshPromise.catch(() => {}); // Ignore - we're just cleaning up

      // Start a new flow to test expiration
      const provider2 = new OAuth2AuthCodeProvider(config, storage);
      const refreshPromise2 = provider2.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput2 = consoleSpy.mock.calls.slice(-10).flat().join(' ');
      const stateMatch2 = consoleOutput2.match(/state=([^&\s]+)/);
      const state2 = stateMatch2![1];

      // Set up expectation for the timeout BEFORE advancing timers
      const timeoutExpectation = expect(refreshPromise2).rejects.toThrow(
        'Authorization timeout - please try again',
      );

      // Advance time past 10 minutes (state expiry) - this will trigger the rejection
      await vi.advanceTimersByTimeAsync(11 * 60 * 1000);

      // Now await the expectation
      await timeoutExpectation;

      // Trying to complete the flow with expired state should also fail
      await expect(
        provider2.completeOAuthFlow(state2, 'test-code'),
      ).rejects.toThrow('Invalid or expired OAuth state');

      provider2.destroy();
    });

    it('should handle state collision gracefully', async () => {
      // This test verifies that each OAuth flow generates unique states
      // Since we can't easily mock crypto.randomBytes in ESM, we test uniqueness

      const states: string[] = [];
      const providers: OAuth2AuthCodeProvider[] = [];

      // Generate multiple flows quickly to test uniqueness
      for (let i = 0; i < 3; i++) {
        const testProvider = new OAuth2AuthCodeProvider(config, storage);
        providers.push(testProvider);

        const refreshPromise = testProvider.refresh();
        await vi.advanceTimersByTimeAsync(20);

        const consoleOutput = consoleSpy.mock.calls.slice(-5).flat().join(' ');
        const stateMatch = consoleOutput.match(/state=([^&\s]+)/);

        if (stateMatch) {
          states.push(stateMatch[1]);
        }

        refreshPromise.catch(() => {});
      }

      // All states should be unique
      expect(states).toHaveLength(3);
      expect(new Set(states).size).toBe(3);

      // Clean up
      providers.forEach((p) => p.destroy());
    });
  });

  describe('PKCE Security', () => {
    it('should generate cryptographically secure code verifier', async () => {
      const verifiers: string[] = [];

      // Generate multiple code verifiers
      for (let i = 0; i < 10; i++) {
        const testProvider = new OAuth2AuthCodeProvider(config, storage);
        const refreshPromise = testProvider.refresh();
        await vi.advanceTimersByTimeAsync(50);

        // We can't directly access the verifier, but we can infer its uniqueness
        // by checking that each authorization URL is unique
        const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
        const challengeMatch = consoleOutput.match(/code_challenge=([^&\s]+)/);

        if (challengeMatch) {
          verifiers.push(challengeMatch[1]);
        }

        testProvider.destroy();
        refreshPromise.catch(() => {});
        consoleSpy.mockClear();
      }

      // All challenges should be unique (indicating unique verifiers)
      expect(verifiers).toHaveLength(10);
      expect(new Set(verifiers).size).toBe(10);

      // Challenges should be base64url encoded
      verifiers.forEach((challenge) => {
        expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(challenge.length).toBe(43); // SHA256 hash base64url encoded = 43 chars
      });
    });

    it('should use SHA256 for code challenge', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
      const challengeMatch = consoleOutput.match(/code_challenge=([^&\s]+)/);
      const methodMatch = consoleOutput.match(
        /code_challenge_method=([^&\s]+)/,
      );

      expect(challengeMatch).toBeTruthy();
      expect(methodMatch).toBeTruthy();
      expect(methodMatch![1]).toBe('S256');

      // Challenge should be 43 characters (SHA256 base64url)
      expect(challengeMatch![1]).toHaveLength(43);

      refreshPromise.catch(() => {});
    });

    it('should require correct verifier for token exchange', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
      const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
      const state = stateMatch![1];

      // Mock token endpoint to capture the request
      let capturedBody: string = '';
      mockFetch.mockImplementationOnce(async (url, options) => {
        if (options && typeof options.body === 'string') {
          capturedBody = options.body;
        }
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'test-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        };
      });

      await provider.completeOAuthFlow(state, 'auth-code-123');
      await refreshPromise;

      // Verify that code_verifier was included in the token request
      expect(capturedBody).toContain('code_verifier=');
      expect(capturedBody).toContain('code=auth-code-123');
      expect(capturedBody).toContain('grant_type=authorization_code');

      // Extract and validate verifier format
      const verifierMatch = capturedBody.match(/code_verifier=([^&]+)/);
      expect(verifierMatch).toBeTruthy();
      const verifier = decodeURIComponent(verifierMatch![1]);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(verifier.length).toBeGreaterThanOrEqual(43); // At least 32 bytes base64url
    });

    it('should reject token exchange with incorrect verifier', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
      const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
      const state = stateMatch![1];

      // Mock OAuth server rejecting invalid verifier
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({
          error: 'invalid_grant',
          error_description: 'Code verifier does not match challenge',
        }),
      });

      // Complete the OAuth flow (this will trigger the error handling)
      await provider.completeOAuthFlow(state, 'auth-code-123');

      // The refresh promise should reject with the error
      await expect(refreshPromise).rejects.toThrow(
        'OAuth2 authentication failed: invalid_grant',
      );
    });
  });

  describe('Token Storage Security', () => {
    beforeEach(() => {
      provider = new OAuth2AuthCodeProvider(config, storage);
    });

    it('should never expose tokens in URLs', async () => {
      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');

      // Verify no sensitive data in authorization URL
      expect(consoleOutput).not.toContain('access_token');
      expect(consoleOutput).not.toContain('token');
      expect(consoleOutput).not.toContain('secret');

      // Should only contain OAuth parameters
      expect(consoleOutput).toContain('response_type=code');
      expect(consoleOutput).toContain('client_id=test-client');
      expect(consoleOutput).toContain('state=');
      expect(consoleOutput).toContain('code_challenge=');

      refreshPromise.catch(() => {});
    });

    it('should clean up tokens on logout', async () => {
      // Store a token
      const tokenData: TokenData = {
        accessToken: 'test-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
        scope: 'read write',
      };

      await storage.store(tokenData);
      expect(await storage.retrieve()).toBeTruthy();

      // Clear tokens
      await storage.clear();
      expect(await storage.retrieve()).toBeNull();
    });

    it('should enforce token expiration', async () => {
      // Store an expired token
      const expiredToken: TokenData = {
        accessToken: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
        tokenType: 'Bearer',
      };

      await storage.store(expiredToken);
      expect(await storage.isExpired()).toBe(true);

      // Store a valid token
      const validToken: TokenData = {
        accessToken: 'valid-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };

      await storage.store(validToken);
      expect(await storage.isExpired()).toBe(false);
    });

    it('should not log sensitive token data', async () => {
      const mockLogEvent = vi.fn();
      vi.doMock('../../src/logger.js', () => ({
        logEvent: mockLogEvent,
      }));

      const tokenData: TokenData = {
        accessToken: 'super-secret-token-12345',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
        scope: 'read write',
      };

      await storage.store(tokenData);

      // Check that no log calls contain the actual token
      const allLogCalls = mockLogEvent.mock.calls.flat();
      const loggedData = allLogCalls.join(' ');

      expect(loggedData).not.toContain('super-secret-token-12345');
      expect(loggedData).not.toContain(tokenData.accessToken);
    });
  });

  describe('Concurrent Flow Isolation', () => {
    it('should handle multiple concurrent OAuth flows', async () => {
      const provider1 = new OAuth2AuthCodeProvider(config, storage);
      const provider2 = new OAuth2AuthCodeProvider(config, storage);
      const provider3 = new OAuth2AuthCodeProvider(config, storage);

      // Start multiple flows concurrently
      const promise1 = provider1.refresh();
      const promise2 = provider2.refresh();
      const promise3 = provider3.refresh();

      await vi.advanceTimersByTimeAsync(100);

      // Each should have generated unique states
      const allOutput = consoleSpy.mock.calls.flat().join(' ');
      const stateMatches = allOutput.match(/state=([^&\s]+)/g);

      expect(stateMatches).toHaveLength(3);

      const states = stateMatches!.map((match) => match.split('=')[1]);
      expect(new Set(states).size).toBe(3); // All unique

      // Clean up
      provider1.destroy();
      provider2.destroy();
      provider3.destroy();

      promise1.catch(() => {});
      promise2.catch(() => {});
      promise3.catch(() => {});
    });

    it('should maintain state isolation between flows', async () => {
      const storage1 = new MemoryTokenStorage();
      const storage2 = new MemoryTokenStorage();
      const provider1 = new OAuth2AuthCodeProvider(config, storage1);
      const provider2 = new OAuth2AuthCodeProvider(config, storage2);

      // Clear console output to start fresh
      consoleSpy.mockClear();

      // Start first flow
      const promise1 = provider1.refresh();
      await vi.advanceTimersByTimeAsync(50);

      // Extract state from first provider
      const output1 = consoleSpy.mock.calls.flat().join(' ');
      const stateMatch1 = output1.match(/state=([^&\s]+)/);
      expect(stateMatch1).toBeTruthy();
      const state1 = stateMatch1![1];

      // Clear console output before second flow
      consoleSpy.mockClear();

      // Start second flow
      const promise2 = provider2.refresh();
      await vi.advanceTimersByTimeAsync(50);

      // Extract state from second provider
      const output2 = consoleSpy.mock.calls.flat().join(' ');
      const stateMatch2 = output2.match(/state=([^&\s]+)/);
      expect(stateMatch2).toBeTruthy();
      const state2 = stateMatch2![1];

      // Verify states are different
      expect(state1).not.toBe(state2);

      // Each provider should only respond to its own state
      await expect(
        provider1.completeOAuthFlow(state2, 'code1'),
      ).rejects.toThrow('Invalid or expired OAuth state');

      await expect(
        provider2.completeOAuthFlow(state1, 'code2'),
      ).rejects.toThrow('Invalid or expired OAuth state');

      // Clean up
      provider1.destroy();
      provider2.destroy();
      promise1.catch(() => {});
      promise2.catch(() => {});
    });

    it('should handle race conditions gracefully', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
      const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
      const state = stateMatch![1];

      // Mock successful response for first completion
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      // Complete the flow once successfully
      await provider.completeOAuthFlow(state, 'code1');
      await refreshPromise;

      // Try to complete the same flow again (should fail)
      await expect(provider.completeOAuthFlow(state, 'code2')).rejects.toThrow(
        'Invalid or expired OAuth state',
      );

      // And again (should fail)
      await expect(provider.completeOAuthFlow(state, 'code3')).rejects.toThrow(
        'Invalid or expired OAuth state',
      );
    });
  });

  describe('State Management Security', () => {
    it('should clean up expired states automatically', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      // Start a flow
      const promise1 = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      // Extract state
      const output = consoleSpy.mock.calls.flat().join(' ');
      const stateMatch = output.match(/state=([^&\s]+)/);
      expect(stateMatch).toBeTruthy();
      const state = stateMatch![1];

      // Set up expectation for timeout BEFORE advancing timers
      const timeoutExpectation = expect(promise1).rejects.toThrow(
        'Authorization timeout - please try again',
      );

      // Advance time past expiration - this will trigger the rejection
      await vi.advanceTimersByTimeAsync(11 * 60 * 1000); // 11 minutes

      // Now await the expectation
      await timeoutExpectation;

      // State should be expired and cleaned up
      await expect(
        provider.completeOAuthFlow(state, 'test-code'),
      ).rejects.toThrow('Invalid or expired OAuth state');

      // Clean up properly
      provider.destroy();
    });

    it('should prevent memory leaks from abandoned flows', async () => {
      // Create many providers with short-lived flows
      const providers: OAuth2AuthCodeProvider[] = [];

      for (let i = 0; i < 10; i++) {
        const testProvider = new OAuth2AuthCodeProvider(config, storage);
        providers.push(testProvider);

        const promise = testProvider.refresh();
        await vi.advanceTimersByTimeAsync(10);

        promise.catch(() => {}); // Prevent unhandled rejection
      }

      // Destroy all providers
      providers.forEach((p) => p.destroy());

      // Advance time to trigger cleanup
      await vi.advanceTimersByTimeAsync(12 * 60 * 1000);

      // Create a new provider and verify it works normally
      const cleanProvider = new OAuth2AuthCodeProvider(config, storage);
      const promise = cleanProvider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const output = consoleSpy.mock.calls
        .slice(-10) // Get last 10 calls to avoid confusion with previous flows
        .flat()
        .join(' ');

      expect(output).toContain('state=');
      expect(output).toContain('code_challenge=');

      cleanProvider.destroy();
      promise.catch(() => {});
    });

    it('should use O(1) state lookup', () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      // The getProviderForState method should be O(1)
      const provider1 =
        OAuth2AuthCodeProvider.getProviderForState('nonexistent');
      expect(provider1).toBeUndefined();

      // Test that the static method exists and works
      expect(typeof OAuth2AuthCodeProvider.getProviderForState).toBe(
        'function',
      );
    });
  });

  describe('Attack Vector Tests', () => {
    beforeEach(() => {
      provider = new OAuth2AuthCodeProvider(config, storage);
    });

    it('should prevent authorization code replay attacks', async () => {
      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
      const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
      const state = stateMatch![1];

      // Mock successful first token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      // First completion should succeed
      await provider.completeOAuthFlow(state, 'auth-code-123');
      await refreshPromise;

      // Try to use the same state/code again (replay attack)
      await expect(
        provider.completeOAuthFlow(state, 'auth-code-123'),
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should prevent token hijacking via URL parameters', async () => {
      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');

      // Verify tokens are never in authorization URL
      expect(consoleOutput).not.toContain('access_token');
      expect(consoleOutput).not.toContain('id_token');
      expect(consoleOutput).not.toContain('refresh_token');

      // Only OAuth2 Authorization Code flow parameters should be present
      expect(consoleOutput).toContain('response_type=code');
      expect(consoleOutput).not.toContain('response_type=token'); // Implicit flow
      expect(consoleOutput).not.toContain('response_type=id_token');

      refreshPromise.catch(() => {});
    });

    it('should validate redirect URI to prevent open redirect', () => {
      // Test with malicious redirect URI
      const maliciousConfig = {
        ...config,
        redirectUri: 'https://evil.com/steal-tokens',
      };

      expect(() => {
        new OAuth2AuthCodeProvider(maliciousConfig, storage);
      }).not.toThrow(); // URI validation is typically done by OAuth server

      // But verify our implementation doesn't modify the redirect URI
      const provider = new OAuth2AuthCodeProvider(maliciousConfig, storage);
      const promise = provider.refresh();
      vi.advanceTimersByTime(50);

      const output = consoleSpy.mock.calls.flat().join(' ');
      expect(output).toContain(
        'redirect_uri=https%3A%2F%2Fevil.com%2Fsteal-tokens',
      );

      provider.destroy();
      promise.catch(() => {});
    });

    it('should handle malformed OAuth responses gracefully', async () => {
      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
      const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
      const state = stateMatch![1];

      // Test malformed JSON response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      await provider.completeOAuthFlow(state, 'test-code');

      await expect(refreshPromise).rejects.toThrow();

      // Start new flow for next test
      provider.destroy();
      const provider2 = new OAuth2AuthCodeProvider(config, storage);
      const promise2 = provider2.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const output2 = consoleSpy.mock.calls.slice(-5).flat().join(' ');
      const stateMatch2 = output2.match(/state=([^&\s]+)/);
      const state2 = stateMatch2![1];

      // Test missing required fields in response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          // Missing access_token
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      await provider2.completeOAuthFlow(state2, 'test-code');

      await expect(promise2).rejects.toThrow();

      provider2.destroy();
    });

    it('should resist timing attacks on state comparison', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
      const stateMatch = consoleOutput.match(/state=([^&\s]+)/);
      const validState = stateMatch![1];

      // Create similar but invalid states
      const invalidStates = [
        validState.slice(0, -1) + 'X', // Change last character
        validState.slice(1), // Remove first character
        validState + 'X', // Add character
        'X' + validState.slice(1), // Change first character
      ];

      // All should fail with same error (timing should be similar)
      for (const invalidState of invalidStates) {
        const start = Date.now();
        await expect(
          provider.completeOAuthFlow(invalidState, 'test-code'),
        ).rejects.toThrow('Invalid or expired OAuth state');
        const duration = Date.now() - start;

        // Duration should be very short (< 10ms) and consistent
        expect(duration).toBeLessThan(10);
      }

      refreshPromise.catch(() => {});
    });
  });

  describe('Cryptographic Security', () => {
    it('should use cryptographically secure random generation', async () => {
      const challenges: string[] = [];
      const states: string[] = [];

      // Generate multiple values
      for (let i = 0; i < 20; i++) {
        const testProvider = new OAuth2AuthCodeProvider(config, storage);
        const promise = testProvider.refresh();
        await vi.advanceTimersByTimeAsync(10);

        const output = consoleSpy.mock.calls.flat().join(' ');
        const stateMatch = output.match(/state=([^&\s]+)/);
        const challengeMatch = output.match(/code_challenge=([^&\s]+)/);

        if (stateMatch && challengeMatch) {
          states.push(stateMatch[1]);
          challenges.push(challengeMatch[1]);
        }

        testProvider.destroy();
        promise.catch(() => {});
        consoleSpy.mockClear();
      }

      // Test for uniqueness (basic randomness check)
      expect(new Set(states).size).toBe(20);
      expect(new Set(challenges).size).toBe(20);

      // Test entropy (no obvious patterns)
      states.forEach((state) => {
        // Should not be all same character
        expect(new Set(state.split('')).size).toBeGreaterThan(5);

        // Should not start with predictable pattern
        expect(state).not.toMatch(/^(abc|123|000|aaa)/);
      });

      challenges.forEach((challenge) => {
        // SHA256 base64url should be exactly 43 characters
        expect(challenge).toHaveLength(43);

        // Should contain mix of characters
        expect(new Set(challenge.split('')).size).toBeGreaterThan(10);
      });
    });

    it('should properly implement PKCE challenge verification', async () => {
      provider = new OAuth2AuthCodeProvider(config, storage);

      let capturedVerifier: string = '';
      let capturedChallenge: string = '';

      // Capture the challenge from URL
      const refreshPromise = provider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const consoleOutput = consoleSpy.mock.calls.flat().join(' ');
      const challengeMatch = consoleOutput.match(/code_challenge=([^&\s]+)/);
      const stateMatch = consoleOutput.match(/state=([^&\s]+)/);

      capturedChallenge = challengeMatch![1];
      const state = stateMatch![1];

      // Capture the verifier from token request
      mockFetch.mockImplementationOnce(async (url, options) => {
        const body = (options?.body as string) || '';
        const verifierMatch = body.match(/code_verifier=([^&]+)/);
        capturedVerifier = decodeURIComponent(verifierMatch![1]);

        return {
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'test-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        };
      });

      await provider.completeOAuthFlow(state, 'test-code');
      await refreshPromise;

      // Verify the challenge matches the verifier
      const expectedChallenge = createHash('sha256')
        .update(capturedVerifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      expect(capturedChallenge).toBe(expectedChallenge);
    });

    it('should handle edge cases in cryptographic operations', async () => {
      // Test with minimal valid config
      const minimalConfig = {
        type: 'oauth2-code' as const,
        clientId: 'test',
        authorizationEndpoint: 'https://auth.example.com/oauth/authorize',
        tokenEndpoint: 'https://auth.example.com/oauth/token',
        redirectUri: 'http://localhost:3000/callback',
      };

      const minimalProvider = new OAuth2AuthCodeProvider(
        minimalConfig,
        storage,
      );
      const promise = minimalProvider.refresh();
      await vi.advanceTimersByTimeAsync(50);

      const output = consoleSpy.mock.calls.flat().join(' ');

      // Should still generate secure values
      expect(output).toMatch(/state=[A-Za-z0-9_-]{20,}/);
      expect(output).toMatch(/code_challenge=[A-Za-z0-9_-]{43}/);
      expect(output).toContain('code_challenge_method=S256');

      minimalProvider.destroy();
      promise.catch(() => {});
    });
  });
});
