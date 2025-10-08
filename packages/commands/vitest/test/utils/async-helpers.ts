/**
 * Configuration options for the waitFor function.
 * @internal
 */
export interface WaitOptions {
  /** Maximum time to wait in milliseconds (default: 5000) */
  timeoutMs?: number;
  /** Polling interval in milliseconds (default: 50) */
  intervalMs?: number;
}

/**
 * Polls a factory function until it returns a non-null/non-undefined value or times out.
 *
 * Repeatedly invokes the factory function at specified intervals until it returns
 * a truthy result. If the factory throws an error, polling stops immediately and
 * the error is propagated. This is useful in tests for waiting on async conditions
 * like session completion or specific status states.
 * @param factory - Function that returns the value to wait for, or null/undefined if not ready
 * @param options - Polling configuration containing timeoutMs and intervalMs properties
 * @returns Promise resolving to the first non-null/non-undefined value from factory
 * @throws When the timeout is exceeded without a successful result
 * @throws Any error thrown by the factory function is rethrown immediately
 * @example Waiting for session completion
 * ```typescript
 * await waitFor(() => {
 *   const status = manager.getSessionStatus(sessionId);
 *   return status.status === 'completed' ? true : null;
 * }, { timeoutMs: 10000 });
 * ```
 * @internal
 */
export async function waitFor<T>(
  factory: () => Promise<T | null | undefined> | T | null | undefined,
  { timeoutMs = 5000, intervalMs = 50 }: WaitOptions = {},
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await factory();
      if (result !== null && result !== undefined) {
        return result;
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    await sleep(intervalMs);
  }
  throw new Error('Timeout waiting for condition');
}

/**
 * Pauses execution for the specified duration.
 * @param durationMs - Time to sleep in milliseconds
 * @example
 * ```typescript
 * await sleep(100); // Wait 100ms before next operation
 * ```
 * @internal
 */
export async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}
