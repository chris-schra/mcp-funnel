/**
 * Bearer token authentication validator for inbound HTTP requests.
 *
 * Validates Authorization header Bearer tokens against configured allowlist
 * with environment variable resolution support and timing-attack protection.
 *
 * Security features:
 * - Constant-time token comparison using crypto.timingSafeEqual
 * - Environment variable resolution for token values
 * - Token format validation before comparison
 * - No token values logged in output
 * @example
 * ```typescript
 * const validator = new BearerTokenValidator({
 *   type: 'bearer',
 *   tokens: ['${AUTH_TOKEN}', 'static-token']
 * });
 *
 * const result = await validator.validateRequest(honoContext);
 * if (result.isAuthenticated) {
 *   // proceed
 * }
 * ```
 * @public
 * @see file:../interfaces/inbound-auth.interface.ts:41 - Config interface
 */

import { timingSafeEqual } from 'crypto';
import type { Context } from 'hono';
import type {
  IInboundAuthValidator,
  AuthResult,
  InboundBearerAuthConfig,
} from '../interfaces/inbound-auth.interface.js';
import {
  EnvironmentResolutionError,
  EnvVarPatternResolver,
} from '@mcp-funnel/core';

/**
 * Bearer token authentication validator.
 * @public
 */
export class BearerTokenValidator implements IInboundAuthValidator {
  private readonly validTokens: string[];
  private readonly resolver: EnvVarPatternResolver;

  public constructor(config: InboundBearerAuthConfig) {
    if (!config.tokens || config.tokens.length === 0) {
      throw new Error(
        'Bearer token configuration must include at least one token',
      );
    }

    // Initialize the environment resolver with strict mode
    this.resolver = new EnvVarPatternResolver({ strict: true });

    // Resolve environment variables and validate tokens
    this.validTokens = [];
    for (const token of config.tokens) {
      try {
        const resolvedToken = this.resolver.resolve(token);
        if (!resolvedToken || resolvedToken.trim().length === 0) {
          throw new Error('Bearer tokens cannot be empty or only whitespace');
        }
        this.validTokens.push(resolvedToken.trim());
      } catch (error) {
        if (error instanceof EnvironmentResolutionError) {
          // Convert to generic Error to maintain existing API
          throw new Error(error.message);
        }
        throw error;
      }
    }

    console.info(
      `Initialized bearer token validator with ${this.validTokens.length} tokens`,
    );
  }

  public async validateRequest(context: Context): Promise<AuthResult> {
    try {
      // Extract Authorization header
      const authHeader = context.req.header('Authorization');

      if (!authHeader) {
        return {
          isAuthenticated: false,
          error: 'Missing Authorization header',
        };
      }

      // Validate Bearer token format - allow capturing potentially empty tokens
      const bearerMatch = authHeader.match(/^Bearer\s+(.*)$/i);
      if (!bearerMatch) {
        return {
          isAuthenticated: false,
          error:
            'Invalid Authorization header format. Expected: Bearer <token>',
        };
      }

      const providedToken = bearerMatch[1].trim();
      if (!providedToken || providedToken.length === 0) {
        return {
          isAuthenticated: false,
          error: 'Empty Bearer token',
        };
      }

      // Validate token against configured tokens
      if (this.isValidToken(providedToken)) {
        return {
          isAuthenticated: true,
          context: {
            authType: 'bearer',
            tokenLength: providedToken.length,
            timestamp: new Date().toISOString(),
          },
        };
      }

      return {
        isAuthenticated: false,
        error: 'Invalid Bearer token',
      };
    } catch (error) {
      console.error('Bearer token validation error:', error);
      return {
        isAuthenticated: false,
        error: 'Authentication validation failed',
      };
    }
  }

  public getType(): string {
    return 'bearer';
  }

  /**
   * Validates token against configured allowlist using constant-time comparison.
   * @param token - Token to validate
   * @returns True if token matches any configured valid token
   * @internal
   */
  private isValidToken(token: string): boolean {
    const tokenBuffer = Buffer.from(token);

    for (const validToken of this.validTokens) {
      const validBuffer = Buffer.from(validToken);

      // Skip if lengths don't match (length check is not timing-sensitive)
      if (tokenBuffer.length !== validBuffer.length) {
        continue;
      }

      // Use constant-time comparison
      if (timingSafeEqual(tokenBuffer, validBuffer)) {
        return true;
      }
    }

    return false;
  }
}
