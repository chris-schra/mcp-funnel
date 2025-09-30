/**
 * Token Storage Security Test Suite
 *
 * CRITICAL SECURITY VALIDATION: This test suite validates token storage security
 * including protection against token exposure in URLs, proper token cleanup,
 * token expiration enforcement, and prevention of sensitive data logging.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTestConfig,
  createTestStorage,
  setupConsoleSpy,
} from './test-utils.js';
import { OAuth2AuthCodeProvider } from '../../implementations/oauth2-authorization-code.js';
import { MemoryTokenStorage } from '../../implementations/memory-token-storage.js';
import type { TokenData } from '@mcp-funnel/core';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';

describe('Token Storage Security', () => {
  let provider: OAuth2AuthCodeProvider;
  let storage: MemoryTokenStorage;
  let config: OAuth2AuthCodeConfig;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    storage = createTestStorage();
    config = createTestConfig();
    provider = new OAuth2AuthCodeProvider(config, storage);

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
