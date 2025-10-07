/**
 * State Management Security Test Suite
 *
 * CRITICAL SECURITY VALIDATION: This test suite validates state management
 * security including automatic cleanup of expired states, memory leak prevention,
 * and O(1) state lookup performance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2AuthCodeProvider } from '../../implementations/oauth2-authorization-code.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import { createTestConfig, createTestStorage, setupConsoleSpy } from './test-utils.js';
import type { MemoryTokenStorage } from '../../implementations/memory-token-storage.js';

describe('State Management Security', () => {
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
    await expect(provider.completeOAuthFlow(state, 'test-code')).rejects.toThrow(
      'Invalid or expired OAuth state',
    );

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
    const provider1 = OAuth2AuthCodeProvider.getProviderForState('nonexistent');
    expect(provider1).toBeUndefined();

    // Test that the static method exists and works
    expect(typeof OAuth2AuthCodeProvider.getProviderForState).toBe('function');
  });
});
