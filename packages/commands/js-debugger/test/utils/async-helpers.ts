export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

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

export async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}
