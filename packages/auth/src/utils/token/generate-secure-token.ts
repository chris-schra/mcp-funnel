import { randomBytes } from 'node:crypto';

/**
 * Generates a cryptographically secure random token using Node's crypto module.
 *
 * Uses base64url encoding (URL-safe base64 without padding) for the output,
 * making it suitable for use in URLs, headers, and OAuth flows.
 * @param length - Number of random bytes to generate (default: 32)
 * @returns Base64url-encoded random string (length varies: ~1.33x input bytes)
 * @example
 * ```typescript
 * // Generate default 32-byte token
 * const token = generateSecureToken(); // ~43 characters
 *
 * // Generate shorter 16-byte token for client IDs
 * const clientId = generateSecureToken(16); // ~22 characters
 * ```
 * @public
 * @see file:./token.utils.ts:10-29 - Usage in token generation methods
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}
