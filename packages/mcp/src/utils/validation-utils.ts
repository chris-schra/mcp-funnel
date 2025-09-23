/**
 * Centralized validation utilities to eliminate DRY violations
 */

// Security validation for serverId (from keychain-token-storage.ts)
const SAFE_SERVER_ID_REGEX = /^[a-zA-Z0-9._-]+$/;

export class ValidationUtils {
  /**
   * Validates a URL string
   * @throws Error if URL is invalid
   */
  static validateUrl(url: string, context?: string): void {
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
  static validateUrls(urls: Record<string, string | undefined>): void {
    for (const [key, url] of Object.entries(urls)) {
      if (url) {
        this.validateUrl(url, key);
      }
    }
  }

  /**
   * Sanitizes and validates a serverId for safe command execution
   * @throws Error if serverId contains unsafe characters
   */
  static sanitizeServerId(serverId: string): string {
    if (!SAFE_SERVER_ID_REGEX.test(serverId)) {
      throw new Error(
        'Invalid serverId: contains unsafe characters. Only alphanumeric characters, dots, underscores, and hyphens are allowed.',
      );
    }
    return serverId;
  }

  /**
   * Validates required config fields
   */
  static validateRequired<T>(
    config: T,
    requiredFields: (keyof T)[],
    context?: string,
  ): void {
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(
          `${context ? context + ': ' : ''}Missing required field: ${String(field)}`,
        );
      }
    }
  }

  /**
   * Validates OAuth config URLs
   */
  static validateOAuthUrls(config: {
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    redirectUri?: string;
  }): void {
    const urlFields: Record<string, string | undefined> = {
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint,
      redirectUri: config.redirectUri,
    };

    this.validateUrls(urlFields);
  }
}

// Export regex patterns for cases where direct regex access is needed
export const SAFE_SERVER_ID_REGEX_PATTERN = SAFE_SERVER_ID_REGEX;
