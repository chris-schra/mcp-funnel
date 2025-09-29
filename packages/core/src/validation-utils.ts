/**
 * Centralized validation utilities to eliminate DRY violations
 */

// Security validation for serverId (from keychain-token-storage.ts)
const SAFE_SERVER_ID_REGEX = /^[a-zA-Z0-9._-]+$/;

/**
 * Validates a URL string
 * @throws Error if URL is invalid
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
 * Validates multiple URLs
 */
function validateUrls(urls: Record<string, string | undefined>): void {
  for (const [key, url] of Object.entries(urls)) {
    if (url) {
      validateUrl(url, key);
    }
  }
}

export const ValidationUtils = {
  validateUrl,
  validateUrls,
  /**
   * Sanitizes and validates a serverId for safe command execution
   * @throws Error if serverId contains unsafe characters
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
   * Validates required config fields
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
// Export regex patterns for cases where direct regex access is needed
export const SAFE_SERVER_ID_REGEX_PATTERN = SAFE_SERVER_ID_REGEX;
