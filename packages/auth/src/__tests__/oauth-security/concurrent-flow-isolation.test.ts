/**
 * OAuth Security Test Suite - Concurrent Flow Isolation
 *
 * CRITICAL SECURITY VALIDATION: This test suite validates concurrent flow
 * isolation to ensure multiple OAuth flows don't interfere with each other.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuth2AuthCodeProvider } from '../../implementations/oauth2-authorization-code.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import { mockFetch, createTestConfig, createTestStorage, setupConsoleSpy } from './test-utils.js';
import { MemoryTokenStorage } from '../../implementations/memory-token-storage.js';

describe('Concurrent Flow Isolation', () => {
  let config: OAuth2AuthCodeConfig;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    config = createTestConfig();

    // Mock console.info to capture OAuth URLs
    consoleSpy = setupConsoleSpy();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle multiple concurrent OAuth flows', async () => {
    const storage = createTestStorage();
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
    await expect(provider1.completeOAuthFlow(state2, 'code1')).rejects.toThrow(
      'Invalid or expired OAuth state',
    );

    await expect(provider2.completeOAuthFlow(state1, 'code2')).rejects.toThrow(
      'Invalid or expired OAuth state',
    );

    // Clean up
    provider1.destroy();
    provider2.destroy();
    promise1.catch(() => {});
    promise2.catch(() => {});
  });

  it('should handle race conditions gracefully', async () => {
    const storage = createTestStorage();
    const provider = new OAuth2AuthCodeProvider(config, storage);

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

    provider.destroy();
  });
});
