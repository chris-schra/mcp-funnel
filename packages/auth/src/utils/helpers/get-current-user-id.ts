/**
 * Get current user ID from request context.
 *
 * Retrieves the user identifier from the `X-User-ID` header. Falls back to
 * a test user ID if the header is not present.
 * @param c - Request context object
 * @param c.req - Request object containing header accessor
 * @param c.req.header - Function to retrieve header values by name
 * @returns User ID string from header, or `'test-user-123'` as fallback.
 *   Despite the return type allowing `null`, the current implementation always
 *   returns a string due to the fallback value.
 * @remarks
 * This is a simplified implementation for development/testing. In production,
 * user ID should be extracted from session, JWT, or other auth mechanism.
 * @example
 * ```typescript
 * const userId = getCurrentUserId(c);
 * console.log(`Current user: ${userId}`);
 * ```
 * @public
 * @see file:./helper.utils.ts:13 - Exported via HelperUtils class
 */
export function getCurrentUserId(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  // This is a simplified implementation
  // In production, extract from session, JWT, or other auth mechanism
  return c.req.header('X-User-ID') || 'test-user-123';
}
