import { createHash } from 'crypto';
import type { TokenData } from '@mcp-funnel/core';

/**
 * Generate secure filename from key using SHA-256 hash
 * @param key - The key to hash
 * @returns Hashed filename
 * @internal
 */
export function getFilename(key: string): string {
  // Simple hash to avoid filesystem issues with special characters
  const hash = createHash('sha256').update(key).digest('hex');
  return `token-${hash.substring(0, 16)}.json`;
}

/**
 * Parse stored token JSON back to TokenData
 * @param jsonString - JSON string representation of token
 * @returns Parsed TokenData object
 * @throws {SyntaxError} When JSON parsing fails due to invalid format
 * @internal
 */
export function parseStoredToken(jsonString: string): TokenData {
  const parsed = JSON.parse(jsonString);

  return {
    accessToken: parsed.accessToken,
    expiresAt: new Date(parsed.expiresAt),
    tokenType: parsed.tokenType || 'Bearer',
    scope: parsed.scope,
  };
}

/**
 * Serialize token data to JSON string for storage
 * @param token - TokenData to serialize
 * @returns JSON string representation
 * @internal
 */
export function serializeToken(token: TokenData): string {
  return JSON.stringify({
    accessToken: token.accessToken,
    expiresAt: token.expiresAt.toISOString(),
    tokenType: token.tokenType,
    scope: token.scope,
  });
}
