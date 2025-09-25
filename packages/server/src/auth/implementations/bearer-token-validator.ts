/**
 * Bearer token validator for inbound authentication
 * Validates Bearer tokens in Authorization headers against configured tokens
 */

import { timingSafeEqual } from 'crypto';
import type { Context } from 'hono';
import type {
  IInboundAuthValidator,
  AuthResult,
  InboundBearerAuthConfig,
} from '../interfaces/inbound-auth.interface.js';
import { EnvironmentResolver, EnvironmentResolutionError } from 'mcp-funnel';

/**
 * Validates incoming requests using Bearer token authentication
 *
 * This validator:
 * - Extracts Bearer tokens from Authorization headers
 * - Validates against a configured list of accepted tokens
 * - Supports environment variable resolution in tokens
 * - Returns detailed authentication results
 *
 * Security considerations:
 * - Tokens are compared securely using constant-time comparison
 * - Never logs actual token values
 * - Validates token format before comparison
 */
export class BearerTokenValidator implements IInboundAuthValidator {
  private readonly validTokens: string[];
  private readonly resolver: EnvironmentResolver;

  constructor(config: InboundBearerAuthConfig) {
    if (!config.tokens || config.tokens.length === 0) {
      throw new Error(
        'Bearer token configuration must include at least one token',
      );
    }

    // Initialize the environment resolver with strict mode
    this.resolver = new EnvironmentResolver({ strict: true });

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

  async validateRequest(context: Context): Promise<AuthResult> {
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

  getType(): string {
    return 'bearer';
  }

  /**
   * Validates a token against the configured valid tokens
   * Uses constant-time comparison to prevent timing attacks
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
