import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a unique session ID using UUID v4.
 *
 * Simple wrapper around uuid v4 generation, providing a seam for
 * potential future customization of session ID format.
 * @returns UUID v4 string for session identification
 * @public
 * @see {@link generateRequestId} - Related function for generating request IDs
 */
export function generateSessionId(): string {
  return uuidv4();
}
