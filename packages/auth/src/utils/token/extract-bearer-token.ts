/**
 * Extracts the token from a Bearer authorization header.
 * @param authHeader - The Authorization header value (e.g., 'Bearer token123')
 * @returns The extracted token or null if not a Bearer token
 * @public
 */
export function extractBearerToken(authHeader: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.replace('Bearer ', '');
}
