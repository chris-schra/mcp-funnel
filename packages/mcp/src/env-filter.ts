/**
 * Environment variable filtering utilities for MCP Funnel.
 *
 * Provides functions to filter environment variables based on allowlists
 * for security and configuration management.
 */

/**
 * Filters environment variables to only include specified keys.
 *
 * @param env - Environment variables object to filter
 * @param allowlist - Array of environment variable names to include
 * @returns Filtered environment variables containing only allowed keys
 *
 * @example
 * ```typescript
 * const filtered = filterEnvVars(process.env, ['PATH', 'NODE_ENV']);
 * // Returns: { PATH: '/usr/bin:...', NODE_ENV: 'development' }
 * ```
 */
export function filterEnvVars(
  env: Record<string, string | undefined>,
  allowlist: string[],
): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const key of allowlist) {
    const value = env[key];
    if (value !== undefined) {
      filtered[key] = value;
    }
  }

  return filtered;
}
