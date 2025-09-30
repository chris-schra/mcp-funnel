import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';
import { createMemoryTokenStorage } from '../../../implementations/memory-token-storage.js';
import {
  createTestToken,
  setupMockTimers,
  restoreTimers,
} from './test-utils.js';

describe('Token Lifecycle', () => {
  let storage: ITokenStorage;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    const timers = setupMockTimers();
    originalSetTimeout = timers.originalSetTimeout;
    originalClearTimeout = timers.originalClearTimeout;
    storage = createMemoryTokenStorage();
  });

  afterEach(() => {
    restoreTimers(originalSetTimeout, originalClearTimeout);
  });

  it('should store and retrieve token successfully', async () => {
    const token = createTestToken();

    await storage.store(token);
    const retrieved = await storage.retrieve();

    expect(retrieved).toEqual(token);
    expect(retrieved?.accessToken).toBe(token.accessToken);
    expect(retrieved?.tokenType).toBe(token.tokenType);
    expect(retrieved?.scope).toBe(token.scope);
    expect(retrieved?.expiresAt).toEqual(token.expiresAt);
  });

  it('should return null when no token is stored', async () => {
    const retrieved = await storage.retrieve();

    expect(retrieved).toBeNull();
  });

  it('should overwrite existing token when storing new one', async () => {
    const token1 = createTestToken();
    const token2 = createTestToken();

    await storage.store(token1);
    await storage.store(token2);

    const retrieved = await storage.retrieve();

    expect(retrieved).toEqual(token2);
    expect(retrieved?.accessToken).toBe(token2.accessToken);
  });

  it('should clear stored token successfully', async () => {
    const token = createTestToken();

    await storage.store(token);
    await storage.clear();

    const retrieved = await storage.retrieve();

    expect(retrieved).toBeNull();
  });

  it('should handle clearing when no token is stored', async () => {
    await expect(storage.clear()).resolves.not.toThrow();

    const retrieved = await storage.retrieve();
    expect(retrieved).toBeNull();
  });

  it('should handle storing token with minimal required fields', async () => {
    const minimalToken: TokenData = {
      accessToken: 'minimal-token',
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: 'Bearer',
    };

    await storage.store(minimalToken);
    const retrieved = await storage.retrieve();

    expect(retrieved).toEqual(minimalToken);
    expect(retrieved?.scope).toBeUndefined();
  });
});
