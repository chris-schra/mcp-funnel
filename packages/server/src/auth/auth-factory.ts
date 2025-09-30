/**
 * Factory for creating inbound authentication validators.
 *
 * Provides centralized creation and configuration of auth validators with
 * exhaustive type checking to ensure all configuration types are handled.
 * @public
 * @see file:./interfaces/inbound-auth.interface.ts - Configuration types
 * @see file:./implementations/bearer-token-validator.ts - Bearer implementation
 * @see file:./implementations/no-auth-validator.ts - No-auth implementation
 */

import type {
  IInboundAuthValidator,
  InboundAuthConfig,
} from './interfaces/inbound-auth.interface.js';
import { BearerTokenValidator } from './implementations/bearer-token-validator.js';
import { NoAuthValidator } from './implementations/no-auth-validator.js';

/**
 * Creates an authentication validator instance from configuration.
 * @param config - Authentication configuration
 * @returns Configured validator implementing IInboundAuthValidator
 * @throws When configuration type is unsupported
 * @example
 * ```typescript
 * const validator = createAuthValidator(\{
 *   type: 'bearer',
 *   tokens: ['secret-token']
 * \});
 * ```
 * @public
 */
export function createAuthValidator(
  config: InboundAuthConfig,
): IInboundAuthValidator {
  switch (config.type) {
    case 'bearer':
      return new BearerTokenValidator(config);

    case 'none':
      return new NoAuthValidator();

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = config;
      throw new Error(
        `Unsupported authentication type: ${(config as { type: string }).type}`,
      );
    }
  }
}

/**
 * Validates authentication configuration structure and required fields.
 *
 * Performs deep validation including type-specific requirements:
 * - Bearer: validates tokens array is non-empty and contains only strings
 * - None: no additional validation beyond type presence
 * @param config - Configuration to validate
 * @throws When configuration is missing required fields or has invalid values
 * @public
 */
export function validateAuthConfig(config: InboundAuthConfig): void {
  if (!config || typeof config !== 'object') {
    throw new Error('Authentication configuration must be an object');
  }

  if (!config.type) {
    throw new Error('Authentication configuration must specify a type');
  }

  switch (config.type) {
    case 'bearer':
      if (!config.tokens || !Array.isArray(config.tokens)) {
        throw new Error('Bearer authentication requires a tokens array');
      }
      if (config.tokens.length === 0) {
        throw new Error('Bearer authentication requires at least one token');
      }
      for (const token of config.tokens) {
        if (typeof token !== 'string') {
          throw new Error('All bearer tokens must be strings');
        }
      }
      break;

    case 'none':
      // No additional validation needed for no-auth
      break;

    default:
      throw new Error(
        `Unsupported authentication type: ${(config as { type: string }).type}`,
      );
  }
}
