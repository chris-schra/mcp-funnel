/**
 * Shared test utilities for ReconnectionManager tests
 */

import { beforeEach, afterEach, vi } from 'vitest';

/**
 * Sets up fake timers before each test
 */
export function setupTimers(): void {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
}
