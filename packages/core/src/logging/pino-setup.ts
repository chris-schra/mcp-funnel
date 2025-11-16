/**
 * Pino logger setup with automatic redaction of sensitive data
 *
 * Uses fast-redact for path-based redaction of sensitive fields.
 * All console.* calls are automatically routed through this logger.
 */

import pino from 'pino';

/**
 * Root logger instance with automatic redaction of sensitive data.
 *
 * Configured with path-based redaction patterns for OAuth tokens, API keys,
 * passwords, and other sensitive fields. Uses the fast-redact library to
 * censor values while preserving object structure.
 *
 * By default, the log level is set to 'silent' to avoid noise. Update the
 * level when needed for debugging.
 *
 * @example
 * ```typescript
 * import { rootLogger } from './pino-setup.js';
 *
 * rootLogger.level = 'info'; // Enable logging
 * rootLogger.info({ password: 'secret' }); // Logs: { password: '[REDACTED]' }
 * ```
 *
 * @public
 * @see {@link setupConsoleLogging} - Monkey-patch console methods
 */
const rootLogger = pino({
  level: 'silent',
  redact: {
    paths: [
      // OAuth & Authentication
      'password',
      '*.password',
      'access_token',
      '*.access_token',
      'refresh_token',
      '*.refresh_token',
      'client_secret',
      '*.client_secret',
      'api_key',
      '*.api_key',
      'apikey',
      '*.apikey',
      'token',
      '*.token',
      'auth',
      '*.auth',
      'authorization',
      '*.authorization',

      // Cloud Provider Secrets
      'AWS_SECRET_KEY',
      '*.AWS_SECRET_KEY',
      'GITHUB_TOKEN',
      '*.GITHUB_TOKEN',
      'GITLAB_ACCESS_TOKEN',
      '*.GITLAB_ACCESS_TOKEN',
      'SLACK_TOKEN',
      '*.SLACK_TOKEN',
      'STRIPE_SECRET_KEY',
      '*.STRIPE_SECRET_KEY',

      // OAuth2 PKCE
      'code_verifier',
      '*.code_verifier',
      'code_challenge',
      '*.code_challenge',
      'code',
      '*.code',
      'state',
      '*.state',

      // Generic sensitive patterns
      '*.secret',
      '*.SECRET',
      '*.key',
      '*.KEY',
      '*.credential',
      '*.CREDENTIAL',
    ],
    censor: '[REDACTED]',
    remove: false, // Keep the keys, just redact values
  },
  serializers: {
    ...pino.stdSerializers,
    // Add custom serializers for specific types if needed
    err: pino.stdSerializers.err,
  },
});

/**
 * Routes all console.* calls through pino with automatic redaction.
 *
 * Monkey-patches console methods (debug, info, warn, error, log) to use
 * the rootLogger, ensuring sensitive data is automatically redacted from
 * all console output.
 *
 * Call this function once at your application entry point before any logging occurs.
 *
 * @example
 * ```typescript
 * import { setupConsoleLogging, rootLogger } from './pino-setup.js';
 *
 * setupConsoleLogging();
 * rootLogger.level = 'info';
 *
 * console.info({ token: 'secret' }); // Automatically redacted
 * ```
 *
 * @public
 * @see {@link rootLogger} - The underlying logger instance
 */
export function setupConsoleLogging(): void {
  (['debug', 'info', 'warn', 'error', 'log'] as const).forEach((name) => {
    // eslint-disable-next-line no-console
    console[name] = (...args: unknown[]) => {
      rootLogger[name === 'log' ? 'debug' : name]?.(args);
    };
  });
}

export { rootLogger };
