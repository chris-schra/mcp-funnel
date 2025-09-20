/**
 * Factory for creating inbound authentication validators
 * Provides centralized creation and configuration of auth validators
 */

import type {
  IInboundAuthValidator,
  InboundAuthConfig,
} from './interfaces/inbound-auth.interface.js';
import { BearerTokenValidator } from './implementations/bearer-token-validator.js';
import { NoAuthValidator } from './implementations/no-auth-validator.js';

/**
 * Creates an authentication validator based on the provided configuration
 *
 * @param config - Authentication configuration
 * @returns Configured authentication validator
 * @throws Error if configuration is invalid or unsupported
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
 * Validates authentication configuration
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
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
