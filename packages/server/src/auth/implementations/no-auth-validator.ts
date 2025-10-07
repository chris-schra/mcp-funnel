/**
 * Pass-through validator that accepts all requests without authentication.
 *
 * Always returns isAuthenticated: true. Provides consistent IInboundAuthValidator
 * interface for scenarios where authentication is disabled or handled externally.
 *
 * Appropriate use cases:
 * - Development environments with no security requirements
 * - Proxy behind external authentication layer (e.g., API gateway)
 * - Testing scenarios requiring open access
 * @example
 * ```typescript
 * const validator = new NoAuthValidator();
 * const result = await validator.validateRequest(context);
 * // result.isAuthenticated is always true
 * ```
 * @public
 * @see file:../interfaces/inbound-auth.interface.ts - Interface definition
 */

import type { Context } from 'hono';
import type { IInboundAuthValidator, AuthResult } from '../interfaces/inbound-auth.interface.js';

/**
 * No-authentication validator.
 * @public
 */
export class NoAuthValidator implements IInboundAuthValidator {
  public constructor() {
    console.info('Initialized no-auth validator - all requests will be allowed');
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
