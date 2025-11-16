/**
 * Utility function for pattern matching with wildcard support
 */

/**
 * Match a string against a pattern with wildcard support
 * @param str - The string to test
 * @param pattern - The pattern to match against (* matches any sequence of characters)
 * @returns True if the string matches the pattern
 */
export function matchesPattern(str: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  // * matches any sequence of characters
  const regexPattern = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')) // Escape special regex chars including hyphen
    .join('.*'); // Replace * with .*

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}
