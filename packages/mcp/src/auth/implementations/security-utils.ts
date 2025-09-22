/**
 * Security utilities for OAuth authentication
 *
 * Provides comprehensive token sanitization for logging, error handling, and
 * safe message construction. Prevents accidental exposure of sensitive data
 * in logs, error messages, and debugging output.
 */

import { randomBytes } from 'crypto';

/**
 * Configuration for security sanitization
 */
export interface SecuritySanitizerConfig {
  /** Custom patterns to sanitize beyond the defaults */
  customPatterns?: Array<{ pattern: RegExp; replacement: string }>;
  /** Whether to sanitize URL query parameters */
  sanitizeUrlParams?: boolean;
  /** Whether to sanitize JSON-like structures */
  sanitizeJsonLike?: boolean;
}

/**
 * Comprehensive security sanitizer for preventing sensitive data exposure
 */
export class SecuritySanitizer {
  private readonly config: SecuritySanitizerConfig;
  private readonly patterns: Array<{ pattern: RegExp; replacement: string }>;

  constructor(config: SecuritySanitizerConfig = {}) {
    this.config = {
      sanitizeUrlParams: true,
      sanitizeJsonLike: true,
      ...config,
    };

    this.patterns = [
      // Base64-like tokens (20+ characters)
      {
        pattern: /\b[a-zA-Z0-9+/]{20,}={0,2}\b/g,
        replacement: '[REDACTED_TOKEN]',
      },

      // Bearer tokens
      {
        pattern: /\bBearer\s+[a-zA-Z0-9._-]+/gi,
        replacement: 'Bearer [REDACTED]',
      },

      // JWT tokens (three base64 parts separated by dots)
      {
        pattern: /\b[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
        replacement: '[REDACTED_JWT]',
      },

      // API keys (common patterns)
      {
        pattern: /\b(?:api[_-]?key|apikey)[=:]\s*[a-zA-Z0-9._-]+/gi,
        replacement: 'api_key=[REDACTED]',
      },

      // Client secrets and similar
      {
        pattern: /\b(?:client[_-]?secret|clientsecret)[=:]\s*[a-zA-Z0-9._-]+/gi,
        replacement: 'client_secret=[REDACTED]',
      },

      // Access tokens
      {
        pattern: /\b(?:access[_-]?token|accesstoken)[=:]\s*[^\s&"']+/gi,
        replacement: 'access_token=[REDACTED]',
      },

      // Refresh tokens
      {
        pattern: /\b(?:refresh[_-]?token|refreshtoken)[=:]\s*[^\s&"']+/gi,
        replacement: 'refresh_token=[REDACTED]',
      },

      // Passwords
      {
        pattern: /\bpassword[=:]\s*[^\s&"']+/gi,
        replacement: 'password=[REDACTED]',
      },

      // Basic auth credentials in URLs
      { pattern: /\/\/[^:]+:[^@]+@/g, replacement: '//[REDACTED]:[REDACTED]@' },

      // Authorization headers
      {
        pattern: /\bAuthorization:\s*[^\r\n]+/gi,
        replacement: 'Authorization: [REDACTED]',
      },

      ...this.getUrlParamPatterns(),
      ...this.getJsonPatterns(),
      ...(config.customPatterns ?? []),
    ];
  }

  /**
   * Sanitizes sensitive data from a string
   */
  sanitize(input: string): string {
    return this.patterns.reduce((result, { pattern, replacement }) => {
      return result.replace(pattern, replacement);
    }, input);
  }

  /**
   * Sanitizes an object by converting to string, sanitizing, then parsing back
   * Useful for logging objects that might contain sensitive data
   */
  sanitizeObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    try {
      const str = JSON.stringify(obj, null, 2);
      const sanitized = this.sanitize(str);
      return JSON.parse(sanitized);
    } catch {
      // If JSON parsing fails, return sanitized string representation
      const str = String(obj);
      return this.sanitize(str);
    }
  }

  /**
   * Creates a safe error message by sanitizing the input
   */
  createSafeErrorMessage(
    message: string,
    context?: Record<string, unknown>,
  ): string {
    const sanitizedMessage = this.sanitize(message);

    if (context) {
      const sanitizedContext = this.sanitizeObject(context);
      return `${sanitizedMessage} | Context: ${JSON.stringify(sanitizedContext)}`;
    }

    return sanitizedMessage;
  }

  /**
   * Get URL parameter sanitization patterns
   */
  private getUrlParamPatterns(): Array<{
    pattern: RegExp;
    replacement: string;
  }> {
    if (!this.config.sanitizeUrlParams) {
      return [];
    }

    return [
      // URL query parameters - common sensitive params
      {
        pattern:
          /([?&](?:access_token|refresh_token|client_secret|password|api_key|token)=)[^&\s]*/gi,
        replacement: '$1[REDACTED]',
      },

      // Form-encoded data
      {
        pattern:
          /((?:access_token|refresh_token|client_secret|password|api_key|token)=)[^&\s]*/gi,
        replacement: '$1[REDACTED]',
      },
    ];
  }

  /**
   * Get JSON-like structure sanitization patterns
   */
  private getJsonPatterns(): Array<{ pattern: RegExp; replacement: string }> {
    if (!this.config.sanitizeJsonLike) {
      return [];
    }

    return [
      // JSON object properties
      {
        pattern:
          /"(?:access_token|refresh_token|client_secret|password|api_key|token)"\s*:\s*"[^"]*"/gi,
        replacement: '"$1": "[REDACTED]"',
      },

      // Relaxed JSON-like structures
      {
        pattern:
          /(?:access_token|refresh_token|client_secret|password|api_key|token):\s*[a-zA-Z0-9._-]+/gi,
        replacement: '$1: [REDACTED]',
      },
    ];
  }
}

/**
 * Request correlation utilities for tracking authentication flows
 */
export class RequestCorrelation {
  private static readonly PREFIX = 'auth';

  /**
   * Generates a unique request ID for correlation
   */
  static generateRequestId(): string {
    const timestamp = Date.now();
    const randomSuffix = randomBytes(4).toString('hex');
    return `${this.PREFIX}_${timestamp}_${randomSuffix}`;
  }

  /**
   * Extracts timestamp from a request ID (if generated by this utility)
   */
  static extractTimestamp(requestId: string): Date | null {
    const match = requestId.match(
      new RegExp(`^${this.PREFIX}_(\\d+)_[a-f0-9]{8}$`),
    );
    if (match) {
      return new Date(parseInt(match[1], 10));
    }
    return null;
  }

  /**
   * Validates that a request ID follows the expected format
   */
  static isValidRequestId(requestId: string): boolean {
    return new RegExp(`^${this.PREFIX}_\\d+_[a-f0-9]{8}$`).test(requestId);
  }
}

/**
 * Safe logging utilities that automatically sanitize sensitive data
 */
export class SafeLogger {
  private readonly sanitizer: SecuritySanitizer;

  constructor(config?: SecuritySanitizerConfig) {
    this.sanitizer = new SecuritySanitizer(config);
  }

  /**
   * Creates a sanitized log entry
   */
  createLogEntry(
    level: string,
    message: string,
    data?: unknown,
  ): Record<string, unknown> {
    return {
      level,
      message: this.sanitizer.sanitize(message),
      data: data ? this.sanitizer.sanitizeObject(data) : undefined,
      timestamp: new Date().toISOString(),
      requestId: RequestCorrelation.generateRequestId(),
    };
  }

  /**
   * Creates a safe error log entry
   */
  createErrorLogEntry(
    error: Error | unknown,
    context?: Record<string, unknown>,
  ): Record<string, unknown> {
    const err = error as Error;

    return this.createLogEntry('error', err.message || String(error), {
      name: err.name,
      stack: err.stack,
      context: context ? this.sanitizer.sanitizeObject(context) : undefined,
    });
  }
}

// Default instances for common use cases
export const defaultSanitizer = new SecuritySanitizer();
export const defaultSafeLogger = new SafeLogger();

/**
 * Utility functions for common sanitization tasks
 */

/**
 * Sanitizes a string using the default sanitizer
 */
export function sanitizeString(input: string): string {
  return defaultSanitizer.sanitize(input);
}

/**
 * Sanitizes an object using the default sanitizer
 */
export function sanitizeObject(obj: unknown): unknown {
  return defaultSanitizer.sanitizeObject(obj);
}

/**
 * Creates a safe error message using the default sanitizer
 */
export function createSafeErrorMessage(
  message: string,
  context?: Record<string, unknown>,
): string {
  return defaultSanitizer.createSafeErrorMessage(message, context);
}

/**
 * Type guard to check if an error has been sanitized
 */
export function isSanitizedError(error: Error): boolean {
  return error.message.includes('[REDACTED');
}

/**
 * HTTP request sanitization utilities
 */
export interface HttpRequestInfo {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Sanitizes HTTP request information for logging
 */
export function sanitizeHttpRequest(request: HttpRequestInfo): HttpRequestInfo {
  const sanitizer = new SecuritySanitizer();

  return {
    ...request,
    url: sanitizer.sanitize(request.url),
    headers: request.headers
      ? Object.fromEntries(
          Object.entries(request.headers).map(([key, value]) => [
            key,
            sanitizer.sanitize(value),
          ]),
        )
      : undefined,
    body: request.body ? sanitizer.sanitize(request.body) : undefined,
  };
}

/**
 * OAuth-specific sanitization utilities
 */
export class OAuthSanitizer extends SecuritySanitizer {
  constructor() {
    super({
      customPatterns: [
        // OAuth2 specific patterns
        { pattern: /\bcode=[a-zA-Z0-9._-]+/gi, replacement: 'code=[REDACTED]' },
        {
          pattern: /\bstate=[a-zA-Z0-9._-]+/gi,
          replacement: 'state=[REDACTED]',
        },
        {
          pattern: /\bcode_verifier=[a-zA-Z0-9._-]+/gi,
          replacement: 'code_verifier=[REDACTED]',
        },
        {
          pattern: /\bcode_challenge=[a-zA-Z0-9._-]+/gi,
          replacement: 'code_challenge=[REDACTED]',
        },

        // PKCE specific
        {
          pattern: /"code_verifier"\s*:\s*"[^"]*"/gi,
          replacement: '"code_verifier": "[REDACTED]"',
        },
        {
          pattern: /"code_challenge"\s*:\s*"[^"]*"/gi,
          replacement: '"code_challenge": "[REDACTED]"',
        },
      ],
    });
  }
}

// Export OAuth-specific sanitizer instance
export const oauthSanitizer = new OAuthSanitizer();
