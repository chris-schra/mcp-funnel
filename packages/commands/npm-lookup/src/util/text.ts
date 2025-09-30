/**
 * Text manipulation utilities for npm-lookup.
 * @internal
 */

/**
 * Truncates text to a maximum length, adding ellipsis if needed.
 *
 * Returns the original text if it's within the limit or empty.
 * Otherwise, truncates to maxLength-3 and appends '...'.
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum allowed length including ellipsis
 * @returns {string} Truncated text with ellipsis or original text
 * @public
 * @see file:./transform.ts:62 - Used to truncate README and description fields
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}
