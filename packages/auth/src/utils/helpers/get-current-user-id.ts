/**
 * Get current user ID from request context
 */
export function getCurrentUserId(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  // This is a simplified implementation
  // In production, extract from session, JWT, or other auth mechanism
  return c.req.header('X-User-ID') || 'test-user-123';
}
