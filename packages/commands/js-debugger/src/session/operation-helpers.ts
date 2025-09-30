/**
 * Helper utilities for debug session operations
 * Provides common patterns for error handling and async operations
 */

/**
 * Wrap an async operation with error handling and event emission
 */
export async function executeWithErrorHandling<T>(
  operation: () => Promise<T>,
  emitError: (error: Error) => Promise<void>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    await emitError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
