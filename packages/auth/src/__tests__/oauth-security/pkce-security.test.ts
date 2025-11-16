/**
 * PKCE Security Test Suite
 *
 * CRITICAL SECURITY VALIDATION: This test suite validates PKCE (Proof Key for
 * Code Exchange) implementation for OAuth2 Authorization Code flow. Tests ensure
 * proper code verifier generation, SHA256 challenge creation, and secure token
 * exchange with verifier validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { OAuth2AuthCodeProvider } from '../../implementations/oauth2-authorization-code.js';
import { mockFetch, createTestConfig, createTestStorage, setupConsoleSpy } from './test-utils.js';
import type { MemoryTokenStorage } from '../../implementations/memory-token-storage.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';

describe('PKCE Security', () => {
  let provider: OAuth2AuthCodeProvider;
  let storage: MemoryTokenStorage;
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
    const methodMatch = consoleOutput.match(/code_challenge_method=([^&\s]+)/);

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
    await expect(refreshPromise).rejects.toThrow('OAuth2 authentication failed: invalid_grant');
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
});
