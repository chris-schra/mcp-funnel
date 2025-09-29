/**
 * No-authentication validator for inbound requests
 * Allows all requests without authentication checks
 */

import type { Context } from 'hono';
import type {
  IInboundAuthValidator,
  AuthResult,
} from '../interfaces/inbound-auth.interface.js';

/**
 * Validator that allows all requests without authentication
 *
 * This validator:
 * - Always returns isAuthenticated: true
 * - Used when inbound authentication is disabled
 * - Provides a consistent interface for open access scenarios
 *
 * Use this validator when:
 * - Running in development environments
 * - The proxy is behind other authentication layers
 * - Authentication is handled externally
 */
export class NoAuthValidator implements IInboundAuthValidator {
  public constructor() {
    console.info(
      'Initialized no-auth validator - all requests will be allowed',
    );
  }

  public async validateRequest(_context: Context): Promise<AuthResult> {
    return {
      isAuthenticated: true,
      context: {
        authType: 'none',
        timestamp: new Date().toISOString(),
      },
    };
  }

  public getType(): string {
    return 'none';
  }
}
