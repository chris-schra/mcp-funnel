/**
 * Helper utilities for debug session operations.
 * Provides common patterns for error handling and async operations used across
 * debug session implementations.
 * @internal
 */

/**
 * Wraps an async operation with standardized error handling and event emission.
 * Executes the provided operation and ensures that any errors are properly emitted
 * via the error handler before re-throwing. This maintains consistent error flow
 * throughout debug sessions where errors need to be both logged/emitted AND propagated.
 * The function always re-throws errors after emission, ensuring callers can handle
 * failures appropriately while guaranteeing error events are fired.
 * @template T - The return type of the async operation
 * @param {() => Promise<T>} operation - The async operation to execute
 * @param {(error: Error) => Promise<void>} emitError - Error handler that emits/logs the error (e.g., EventEmitter.emit)
 * @returns {Promise<T>} Promise resolving to the operation's result
 * @throws {Error} Re-throws any error caught from the operation after emitting it
 * @example
 * ```typescript
 * // In EnhancedDebugSession.initialize()
 * return executeWithErrorHandling(
 *   async () => {
 *     await this.adapter.connect(this.request.target);
 *     this._lifecycleState = 'active';
 *   },
 *   async (error) => {
 *     await this.emit('error', error);
 *   }
 * );
 * ```
 * @public
 * @see file:../enhanced-debug-session.ts:172 - Usage in session initialization
 * @see file:../enhanced-debug-session.ts:256 - Usage in pause operations
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
