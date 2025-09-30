/**
 * Centralized validation utilities to eliminate DRY violations.
 *
 * Provides reusable validation functions for URLs, server IDs, and configuration
 * objects, ensuring consistent error messages and security checks across the codebase.
 * @public
 */

// Security validation for serverId (from keychain-token-storage.ts)
const SAFE_SERVER_ID_REGEX = /^[a-zA-Z0-9._-]+$/;

/**
 * Validates a URL string.
 * @param url - URL string to validate
 * @param context - Optional context string for error messages
 * @throws \{Error\} When URL is empty or invalid format
 * @internal
 */
function validateUrl(url: string, context?: string): void {
  if (!url) {
    throw new Error(`${context ? context + ': ' : ''}URL is required`);
  }

  try {
    new URL(url);
  } catch {
    throw new Error(
      `${context ? context + ': ' : ''}Invalid URL format: ${url}`,
    );
  }
}

/**
 * Validates multiple URLs from a record.
 * @param urls - Record of URL strings, undefined values are skipped
 * @throws \{Error\} When any URL is invalid, with key in error message
 * @internal
 */
function validateUrls(urls: Record<string, string | undefined>): void {
  for (const [key, url] of Object.entries(urls)) {
    if (url) {
      validateUrl(url, key);
    }
  }
}

/**
 * Collection of validation utility functions.
 *
 * Provides centralized validation methods for URLs, server IDs, configuration
 * objects, and OAuth-specific URL sets. All validation failures throw descriptive
 * errors with context information.
 * @example
 * ```typescript
 * // Validate a single URL
 * ValidationUtils.validateUrl('https://api.example.com', 'API endpoint');
 *
 * // Sanitize a server ID
 * const safeId = ValidationUtils.sanitizeServerId('my-server_1.0');
 *
 * // Validate required config fields
 * ValidationUtils.validateRequired(config, ['name', 'command'], 'ServerConfig');
 * ```
 * @public
 */
export const ValidationUtils = {
  validateUrl,
  validateUrls,
  /**
   * Sanitizes and validates a serverId for safe command execution.
   *
   * Prevents command injection by ensuring server IDs only contain
   * alphanumeric characters, dots, underscores, and hyphens.
   * @param serverId - Server ID to validate
   * @returns The same serverId if valid
   * @throws \{Error\} When serverId contains unsafe characters
   */
  sanitizeServerId: (serverId: string): string => {
    if (!SAFE_SERVER_ID_REGEX.test(serverId)) {
      throw new Error(
        'Invalid serverId: contains unsafe characters. Only alphanumeric characters, dots, underscores, and hyphens are allowed.',
      );
    }
    return serverId;
  },
  /**
   * Validates required config fields are present.
   * @param config - Configuration object to validate
   * @param requiredFields - Array of field names that must be present
   * @param context - Optional context string for error messages
   * @throws \{Error\} When any required field is missing
   */
  validateRequired: <T>(
    config: T,
    requiredFields: (keyof T)[],
    context?: string,
  ): void => {
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(
          `${context ? context + ': ' : ''}Missing required field: ${String(field)}`,
        );
      }
    }
  },
  /**
   * Validates OAuth configuration URLs.
   *
   * Convenience method for validating the common set of URLs used in OAuth flows.
   * @param config - OAuth configuration with optional URL fields
   * @throws \{Error\} When any present URL is invalid
   */
  validateOAuthUrls: (config: {
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    redirectUri?: string;
  }): void => {
    const urlFields: Record<string, string | undefined> = {
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint,
      redirectUri: config.redirectUri,
    };

    ValidationUtils.validateUrls(urlFields);
  },
};

/**
 * Regex pattern for validating safe server IDs.
 *
 * Exported for cases where direct regex access is needed for validation
 * without throwing errors.
 * @public
 */
export const SAFE_SERVER_ID_REGEX_PATTERN = SAFE_SERVER_ID_REGEX;
