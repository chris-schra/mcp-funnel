import { randomBytes } from 'node:crypto';

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}
