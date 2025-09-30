/**
 * Utilities for determining the origin of code files
 */

export type CodeOrigin = 'user' | 'internal' | 'library' | 'unknown';

/**
 * Determine the origin of a code file based on its URL/path
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
