/**
 * OAuth Security Test Suite - CSRF Protection
 *
 * CRITICAL SECURITY VALIDATION: This test suite validates CSRF protection
 * mechanisms including state generation, validation, expiration, and collision handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2AuthCodeProvider } from '../../implementations/oauth2-authorization-code.js';
import {
  createTestConfig,
  createTestStorage,
  setupConsoleSpy,
} from './test-utils.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import { MemoryTokenStorage } from '../../implementations/memory-token-storage.js';

describe('CSRF Protection', () => {
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
  });

  afterEach(() => {
    if (provider) {
      provider.destroy();
    }
    consoleSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

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
