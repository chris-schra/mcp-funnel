/**
 * Tests for ReconnectionManager - Initialization
 */

import { describe, it, expect } from 'vitest';
import { ReconnectionManager } from '../../../reconnection-manager/index.js';
import { ConnectionState, type ReconnectionConfig } from '@mcp-funnel/models';
import { setupTimers } from './test-utils.js';

describe('ReconnectionManager - Initialization', () => {
  setupTimers();

  it('starts with Disconnected state', () => {
    const manager = new ReconnectionManager();
    expect(manager.state).toBe(ConnectionState.Disconnected);
  });

  it('starts with zero retry count', () => {
    const manager = new ReconnectionManager();
    expect(manager.currentRetryCount).toBe(0);
  });

  it('applies default configuration', () => {
    const manager = new ReconnectionManager();
    expect(manager.hasRetriesLeft).toBe(true);
  });

  it('accepts custom configuration with legacy property names', () => {
    const config: ReconnectionConfig = {
      maxAttempts: 5,
      initialDelayMs: 2000,
      backoffMultiplier: 3,
      maxDelayMs: 10000,
    };
    const manager = new ReconnectionManager(config);
    expect(manager.hasRetriesLeft).toBe(true);
  });

  it('accepts custom configuration with new property names', () => {
    const config: ReconnectionConfig = {
      maxRetries: 5,
      initialDelay: 2000,
      backoffMultiplier: 3,
      maxDelay: 10000,
      jitter: 0.1,
    };
    const manager = new ReconnectionManager(config);
    expect(manager.hasRetriesLeft).toBe(true);
  });
});
