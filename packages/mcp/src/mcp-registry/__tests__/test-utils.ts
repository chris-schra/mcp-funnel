/**
 * Shared test utilities for MCPRegistryClient tests.
 */

import type { IRegistryCache } from '../interfaces/cache.interface.js';

/**
 * Mock cache implementation for testing.
 */
export class MockCache implements IRegistryCache<unknown> {
  private storage = new Map<string, { value: unknown; expires?: number }>();

  async get(key: string): Promise<unknown | null> {
    const item = this.storage.get(key);
    if (!item) return null;
    if (item.expires && Date.now() > item.expires) {
      this.storage.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const expires = ttlMs ? Date.now() + ttlMs : undefined;
    this.storage.set(key, { value, expires });
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }
}

/**
 * No-op cache implementation for testing without cache.
 */
export class NoOpCache implements IRegistryCache<unknown> {
  async get(): Promise<null> {
    return null;
  }

  async set(): Promise<void> {
    // No-op
  }

  async has(): Promise<boolean> {
    return false;
  }

  async delete(): Promise<void> {
    // No-op
  }

  async clear(): Promise<void> {
    // No-op
  }
}
