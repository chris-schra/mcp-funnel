/**
 * Receipt token utilities for content-based file verification.
 *
 * Provides stateless, deterministic tokens for forcing structure-first
 * workflow when reading large files. Tokens automatically invalidate when
 * file content changes.
 *
 * @see file:../../../.tmp/PLAN.md - Phase 1 implementation details
 * @internal
 */

import revHash from 'rev-hash';
import { readFileSync } from 'node:fs';

/**
 * Generate a content-based receipt token for a file.
 *
 * The token is deterministic (same content = same token) and stateless.
 * Automatically invalidates when file content changes.
 *
 * @param filePath - Absolute path to file
 * @returns Content-based hash token
 * @public
 * @example
 * ```typescript
 * const token = generateReceiptToken('/path/to/file.ts');
 * // Returns: "7a3f9c2e1b4d"
 * ```
 */
export function generateReceiptToken(filePath: string): string {
  const content = readFileSync(filePath);
  return revHash(content);
}

/**
 * Validate a receipt token against current file content.
 *
 * @param filePath - Absolute path to file
 * @param token - Token to validate
 * @returns True if token matches current file content
 * @public
 * @example
 * ```typescript
 * const isValid = validateToken('/path/to/file.ts', '7a3f9c2e1b4d');
 * // Returns: true if content matches, false if file changed
 * ```
 */
export function validateToken(filePath: string, token: string): boolean {
  const expected = generateReceiptToken(filePath);
  return token === expected;
}
