/**
 * Hono middleware factory for request authentication validation.
 *
 * Creates middleware that validates requests using configured validators,
 * returning 401 for authentication failures and attaching auth context
 * to successful requests for downstream handlers.
 *
 * The middleware logs authentication events (successes and failures) with
 * IP address, user agent, and timestamp for security monitoring.
 * @example
 * ```typescript
 * const validator = createAuthValidator(config);
 * const authMiddleware = createAuthMiddleware(validator);
 *
 * app.use('/api/*', authMiddleware);
 * ```
 * @public
 * @see file:../interfaces/inbound-auth.interface.ts - Validator interface
 */

import type { Context, Next, MiddlewareHandler } from 'hono';
import type { IInboundAuthValidator } from '../interfaces/inbound-auth.interface.js';

/**
 * Creates Hono authentication middleware from validator.
 *
 * Returns 401 Unauthorized with WWW-Authenticate header when authentication
 * fails. Attaches auth context to request via c.set('authContext') on success.
 * @param {IInboundAuthValidator} validator - Authentication validator to use for request validation
 * @returns {MiddlewareHandler} Hono middleware function
 * @public
 */
export function createAuthMiddleware(
  validator: IInboundAuthValidator,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    try {
      // Validate the request using the configured validator
      const authResult = await validator.validateRequest(c);

      if (!authResult.isAuthenticated) {
        // Log authentication failure for security monitoring
        console.warn('Authentication failed:', {
          ip:
            c.req.header('X-Forwarded-For') ||
            c.req.header('X-Real-IP') ||
            'unknown',
          userAgent: c.req.header('User-Agent') || 'unknown',
          path: c.req.path,
          method: c.req.method,
          error: authResult.error,
          timestamp: new Date().toISOString(),
        });

        return c.json(
          {
            error: 'Unauthorized',
            message: authResult.error || 'Authentication required',
            timestamp: new Date().toISOString(),
          },
          401,
          {
            'WWW-Authenticate': getWWWAuthenticateHeader(validator.getType()),
          },
        );
      }

      // Add authentication context to the request
      // This allows downstream handlers to access auth information
      c.set('authContext', authResult.context);

      // Log successful authentication for audit purposes
      console.info('Authentication successful:', {
        authType: validator.getType(),
        path: c.req.path,
        method: c.req.method,
        timestamp: new Date().toISOString(),
      });

      await next();
    } catch (error) {
      console.error('Authentication middleware error:', error);
      return c.json(
        {
          error: 'Internal Server Error',
          message: 'Authentication system error',
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }
  };
}

/**
 * Returns WWW-Authenticate header value based on authentication type.
 * @param {string} authType - Authentication type identifier (e.g., 'bearer', 'none')
 * @returns {string} RFC 7235 compliant WWW-Authenticate header value
 * @internal
 */
function getWWWAuthenticateHeader(authType: string): string {
  switch (authType) {
    case 'bearer':
      return 'Bearer realm="MCP Proxy API"';
    default:
      return 'Bearer realm="MCP Proxy API"';
  }
}

/**
 * Extracts authentication context attached by createAuthMiddleware.
 *
 * Returns the context object attached via c.set('authContext') during
 * authentication. Returns undefined if middleware hasn't run or auth failed.
 * @param {Context} c - Hono context from request handler
 * @returns {Record<string, unknown> | undefined} Authentication context or undefined
 * @public
 */
export function getAuthContext(
  c: Context,
): Record<string, unknown> | undefined {
  return c.get('authContext');
}
