/**
 * OAuth Security Test Suite - Cryptographic Security
 *
 * Tests cryptographic operations including secure random generation,
 * PKCE challenge verification, and edge cases in cryptographic operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { OAuth2AuthCodeProvider } from '../../implementations/oauth2-authorization-code.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import { createTestConfig, createTestStorage, setupConsoleSpy, mockFetch } from './test-utils.js';
import { MemoryTokenStorage } from '../../implementations/memory-token-storage.js';

describe('Cryptographic Security', () => {
  let storage: MemoryTokenStorage;
  let provider: OAuth2AuthCodeProvider;
  let config: OAuth2AuthCodeConfig;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    storage = createTestStorage();
    config = createTestConfig();

    // Mock console.info to capture OAuth URLs
    consoleSpy = setupConsoleSpy();
  });

  afterEach(() => {
    if (provider) {
      provider.destroy();
    }
    consoleSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

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
    mockFetch.mockImplementationOnce(async (url: string, options?: RequestInit) => {
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

    const minimalProvider = new OAuth2AuthCodeProvider(minimalConfig, storage);
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
