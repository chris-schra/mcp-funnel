/**
 * Request parameter validation and coercion utilities for OAuth API handlers
 */

import { parseScopes } from '../../oauth/utils/oauth-utils.js';

/**
 * OAuth request context type for consistent handling
 */
export interface OAuthRequestContext {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}

/**
 * Check if client prefers JSON response based on Accept header or format query param
 */
export function prefersJsonResponse(c: OAuthRequestContext): boolean {
  const format = c.req.query('format');
  if (format && format.toLowerCase() === 'json') {
    return true;
  }

  const accept = c.req.header('accept');
  return accept !== undefined && accept.includes('application/json');
}

/**
 * Coerce various types to string representation
 */
export function coerceToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const coerced = coerceToString(entry);
      if (coerced) {
        return coerced;
      }
    }
  }

  return undefined;
}

/**
 * Parse boolean flags from various input formats
 */
export function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = coerceToString(value);
  if (!normalized) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  return (
    lowered === 'true' ||
    lowered === '1' ||
    lowered === 'yes' ||
    lowered === 'on'
  );
}

/**
 * Normalize scope input to array of scope strings
 */
export function normalizeScopeInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    const scoped: string[] = [];
    for (const entry of value) {
      const converted = coerceToString(entry);
      if (converted) {
        scoped.push(...parseScopes(converted));
      }
    }
    return scoped;
  }

  const single = coerceToString(value);
  return single ? parseScopes(single) : [];
}

/**
 * Coerce various types to number
 */
export function coerceToNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const str = coerceToString(value);
  if (!str) {
    return undefined;
  }

  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Extract user ID from request context
 * In production, this should integrate with your authentication system
 */
export function getCurrentUserId(c: OAuthRequestContext): string | null {
  // This is a simplified implementation
  // In production, extract from session, JWT, or other auth mechanism
  return c.req.header('X-User-ID') || 'test-user-123';
}
