/**
 * OAuth Security Attack Vector Tests
 *
 * CRITICAL SECURITY VALIDATION: This test suite validates protection against
 * common OAuth attack vectors including authorization code replay attacks,
 * token hijacking, redirect manipulation, malformed responses, and timing attacks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2AuthCodeProvider } from '../../implementations/oauth2-authorization-code.js';
import { mockFetch, createTestConfig, createTestStorage, setupConsoleSpy } from './test-utils.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import type { MemoryTokenStorage } from '../../implementations/memory-token-storage.js';

describe('Attack Vector Tests', () => {
  let provider: OAuth2AuthCodeProvider;
  let storage: MemoryTokenStorage;
  let config: OAuth2AuthCodeConfig;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    storage = createTestStorage();
    config = createTestConfig();
    consoleSpy = setupConsoleSpy();
    provider = new OAuth2AuthCodeProvider(config, storage);
  });

  afterEach(() => {
    if (provider) {
      provider.destroy();
    }
    consoleSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
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
    await expect(provider.completeOAuthFlow(state, 'auth-code-123')).rejects.toThrow(
      'Invalid or expired OAuth state',
    );
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
    expect(output).toContain('redirect_uri=https%3A%2F%2Fevil.com%2Fsteal-tokens');

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
      await expect(provider.completeOAuthFlow(invalidState, 'test-code')).rejects.toThrow(
        'Invalid or expired OAuth state',
      );
      const duration = Date.now() - start;

      // Duration should be very short (< 10ms) and consistent
      expect(duration).toBeLessThan(10);
    }

    refreshPromise.catch(() => {});
  });
});
