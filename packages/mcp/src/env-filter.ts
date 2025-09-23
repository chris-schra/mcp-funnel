/**
 * Environment variable filtering utilities for MCP Funnel.
 *
 * Provides functions to filter environment variables based on allowlists
 * for security and configuration management.
 */

/**
 * Defines additional environment variables that should be preserved for
 * specific platforms. Use this when a platform requires core variables to
 * resolve other paths (e.g. Windows expands %SystemRoot%).
 */
export type PlatformEnvAllowlist = Partial<
  Record<NodeJS.Platform, readonly string[]>
>;

/**
 * Core environment variables that are safe to pass through on every platform.
 */
const COMMON_ENV_ALLOWLIST: readonly string[] = [
  'NODE_ENV',
  'HOME',
  'USER',
  'PATH', // Required for finding executables
  'TERM',
  'CI',
  'DEBUG',
];

/**
 * Environment variables that Windows processes rely on for resolving built-in
 * tooling. These must stay available because PATH entries frequently reference
 * them using %VAR% expansion.
 */
export const WINDOWS_REQUIRED_ENV: readonly string[] = [
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'ProgramData',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'PUBLIC',
  'TEMP',
  'TMP',
  'WINDIR',
];

const PLATFORM_ENV_ALLOWLIST: PlatformEnvAllowlist = {
  win32: WINDOWS_REQUIRED_ENV,
};

/**
 * Returns the default passthrough environment variable allowlist for the given
 * platform. The list combines the platform-independent core variables with any
 * platform-specific requirements.
 */
export function getDefaultPassthroughEnv(
  platform: NodeJS.Platform = process.platform,
): string[] {
  const platformAllowlist = PLATFORM_ENV_ALLOWLIST[platform] ?? [];
  const combined = new Set<string>([
    ...COMMON_ENV_ALLOWLIST,
    ...platformAllowlist,
  ]);
  return Array.from(combined);
}

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
