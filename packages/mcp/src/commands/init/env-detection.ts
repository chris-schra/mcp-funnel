import type { ServerConfig } from '../init.js';

/**
 * Detect potentially sensitive environment variable keys
 * @param env - Environment variables object to check
 * @returns Array of keys that match sensitive patterns
 */
export function detectSensitiveKeys(env?: Record<string, string>): string[] {
  if (!env) return [];

  const sensitivePatterns = ['TOKEN', 'SECRET', 'KEY', 'PASSWORD', 'CREDENTIAL', 'API_KEY', 'AUTH'];

  return Object.keys(env).filter((key) =>
    sensitivePatterns.some((pattern) => key.toUpperCase().includes(pattern)),
  );
}

/**
 * Warn about sensitive environment variables in server configuration
 * @param name - Server name
 * @param config - Server configuration to check
 */
export function warnAboutSensitiveEnvVars(name: string, config: ServerConfig): void {
  const sensitive = detectSensitiveKeys(config.env);

  if (sensitive.length > 0) {
    console.warn(`
⚠️  Server "${name}" exposes sensitive environment variables:
   ${sensitive.join(', ')}

   Consider using secret providers for better security:
   docs/secret-management.md
`);
  }
}
