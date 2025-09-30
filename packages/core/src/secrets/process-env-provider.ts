/**
 * Process environment variable secret provider implementation.
 *
 * This provider loads secrets from the current process environment variables
 * with configurable filtering options including prefix, allowlist, and blocklist.
 * Following the SEAMS principle, this implementation provides the foundation
 * for environment-based secret resolution.
 */

import { BaseSecretProvider } from './base-provider.js';
import type { ProcessEnvProviderConfig } from './provider-configs.js';

/**
 * Secret provider that resolves secrets from process environment variables.
 *
 * Supports filtering through:
 * - Prefix filtering: Only include variables starting with a specific prefix
 * - Allowlist: Only include specific variable names
 * - Blocklist: Exclude specific variable names
 *
 * @example
 * ```typescript
 * // Filter by prefix
 * const provider = new ProcessEnvProvider({
 *   type: 'process',
 *   config: { prefix: 'MCP_' }
 * });
 *
 * // Use allowlist
 * const provider = new ProcessEnvProvider({
 *   type: 'process',
 *   config: { allowlist: ['API_KEY', 'DATABASE_URL'] }
 * });
 * ```
 */
export class ProcessEnvProvider extends BaseSecretProvider {
  private readonly config: ProcessEnvProviderConfig['config'];

  /**
   * Creates a new ProcessEnvProvider instance.
   *
   * @param config - Configuration specifying filtering rules for environment variables
   */
  public constructor(config: ProcessEnvProviderConfig) {
    super('process');
    this.config = config.config;
  }

  /**
   * Resolves secrets from process environment variables based on configuration filters.
   *
   * Filtering precedence:
   * 1. Allowlist (if specified) - only include variables in the list
   * 2. Prefix filtering (if specified) - only include variables with the prefix
   * 3. Blocklist (if specified) - exclude variables in the list
   *
   * @returns A promise resolving to filtered environment variables as key-value pairs
   */
  protected async doResolveSecrets(): Promise<Record<string, string>> {
    const secrets: Record<string, string> = {};
    const { prefix, allowlist, blocklist } = this.config;

    // Get all environment variables, filtering out undefined values
    const envVars = Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    );

    for (const [key, value] of envVars) {
      let secretKey = key;
      let shouldInclude = true;

      // Apply allowlist filter first (takes precedence)
      if (allowlist && allowlist.length > 0) {
        shouldInclude = allowlist.includes(key);

        // If allowlisted and has prefix, strip prefix for the secret key
        if (shouldInclude && prefix && key.startsWith(prefix)) {
          secretKey = key.slice(prefix.length);
        }
      } else if (prefix) {
        // Apply prefix filter if no allowlist
        shouldInclude = key.startsWith(prefix);
        if (shouldInclude) {
          secretKey = key.slice(prefix.length);
        }
      }

      // Apply blocklist filter (always applied last)
      if (shouldInclude && blocklist && blocklist.length > 0) {
        shouldInclude = !blocklist.includes(key);
      }

      // Include the variable if it passes all filters
      if (shouldInclude) {
        secrets[secretKey] = value;
      }
    }

    return secrets;
  }
}
