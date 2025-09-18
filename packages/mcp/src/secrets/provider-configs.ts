/**
 * Configuration types for secret providers in the MCP Funnel system.
 *
 * This module defines configuration structures for various secret providers
 * that can be used to load environment variables and secrets from different sources.
 * The discriminated union design allows for type-safe configuration and
 * easy extension with additional provider types in the future.
 */

/**
 * Configuration for the dotenv secret provider.
 * Loads secrets from a .env file on the filesystem.
 */
export interface DotEnvProviderConfig {
  /** Provider type discriminator */
  type: 'dotenv';
  /** Provider-specific configuration */
  config: {
    /**
     * Path to the .env file to load.
     * Can be relative (to the config file) or absolute.
     * @example '.env', '/absolute/path/.env', './configs/.env.local'
     */
    path: string;
    /**
     * File encoding to use when reading the .env file.
     * @default 'utf-8'
     */
    encoding?: string;
  };
}

/**
 * Configuration for the process environment secret provider.
 * Loads secrets from the current process environment variables.
 */
export interface ProcessEnvProviderConfig {
  /** Provider type discriminator */
  type: 'process';
  /** Provider-specific configuration */
  config: {
    /**
     * Only include environment variables that start with this prefix.
     * The prefix will be stripped from the variable name when exposed.
     * @example 'MCP_' - includes MCP_API_KEY as API_KEY
     */
    prefix?: string;
    /**
     * Allowlist of specific environment variable names to include.
     * Takes precedence over prefix filtering when both are specified.
     * @example ['API_KEY', 'DATABASE_URL']
     */
    allowlist?: string[];
    /**
     * Blocklist of specific environment variable names to exclude.
     * Applied after prefix and allowlist filtering.
     * @example ['DEBUG', 'NODE_ENV']
     */
    blocklist?: string[];
  };
}

/**
 * Configuration for the inline secret provider.
 * Provides secrets directly as key-value pairs in the configuration.
 * Note: This provider should be used carefully as secrets are stored in plain text.
 */
export interface InlineProviderConfig {
  /** Provider type discriminator */
  type: 'inline';
  /** Provider-specific configuration */
  config: {
    /**
     * Direct key-value pairs of secrets.
     * Keys become the secret names, values are the secret values.
     * @example { 'API_KEY': 'secret123', 'DATABASE_URL': 'postgres://...' }
     */
    values: Record<string, string>;
  };
}

/**
 * Union type of all available secret provider configurations.
 * This discriminated union enables type-safe configuration handling
 * and compiler-enforced exhaustive checking when processing different provider types.
 *
 * To extend with new provider types:
 * 1. Define a new interface following the pattern (type + config)
 * 2. Add it to this union type
 * 3. Update any switch/case statements that handle provider configs
 *
 * Future provider types might include:
 * - HashiCorp Vault
 * - AWS Secrets Manager
 * - Azure Key Vault
 * - Google Secret Manager
 * - Kubernetes Secrets
 */
export type SecretProviderConfig =
  | DotEnvProviderConfig
  | ProcessEnvProviderConfig
  | InlineProviderConfig;
