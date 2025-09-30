/**
 * Utilities for determining the origin of code files during Node.js debugging.
 *
 * This module provides simple heuristic-based classification of script URLs/paths
 * into origin categories (user code, Node.js internals, npm libraries, or unknown).
 * Used during stack trace construction to help developers distinguish between
 * their code and framework/library code.
 * @internal
 * @see file:../node-adapter.ts:262 - Primary usage in stack trace generation
 * @see file:../../types/debug-state.ts:1 - Canonical CodeOrigin type definition
 */

/**
 * Classification of code source origin during debugging.
 *
 * - `user`: User's application code (file:// paths or local absolute paths)
 * - `internal`: Node.js built-in modules (node:, internal/ prefixes)
 * - `library`: Third-party dependencies (node_modules paths)
 * - `unknown`: Unclassifiable or missing URL
 * @public
 * @see file:../../types/debug-state.ts:1 - Canonical type definition
 */
export type CodeOrigin = 'user' | 'internal' | 'library' | 'unknown';

/**
 * Classifies the origin of a code file based on its URL or file path.
 *
 * Uses simple heuristics to determine if a script URL represents user code,
 * Node.js internals, npm libraries, or unknown sources. This classification
 * helps filter and prioritize stack frames during debugging.
 *
 * Classification rules (evaluated in order):
 * 1. Missing URL → `unknown`
 * 2. `node:` or `internal/` prefix → `internal` (Node.js built-ins)
 * 3. Contains `node_modules` → `library` (npm dependencies)
 * 4. `file://` prefix, absolute path, or no scheme → `user` (application code)
 * 5. Otherwise → `unknown`
 * @param url - Script URL from Chrome DevTools Protocol (may be undefined)
 * @returns Classification of the script's origin
 * @example
 * ```typescript
 * determineCodeOrigin('node:fs')                    // 'internal'
 * determineCodeOrigin('/path/to/node_modules/pkg')  // 'library'
 * determineCodeOrigin('file:///app/src/index.js')   // 'user'
 * determineCodeOrigin(undefined)                    // 'unknown'
 * ```
 * @public
 * @see file:../node-adapter.ts:262 - Usage in stack trace generation
 * @see file:../../utils/locations.ts:16 - Alternative classifier with configurable matchers
 */
export function determineCodeOrigin(url?: string): CodeOrigin {
  if (!url) return 'unknown';

  if (url.startsWith('node:') || url.startsWith('internal/')) {
    return 'internal';
  }

  if (url.includes('node_modules')) {
    return 'library';
  }

  if (url.startsWith('file://') || url.startsWith('/') || !url.includes(':')) {
    return 'user';
  }

  return 'unknown';
}
