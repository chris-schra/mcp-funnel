/**
 * Hono middleware for inbound authentication
 * Validates incoming requests using configured authentication validators
 */

import type { Context, Next, MiddlewareHandler } from 'hono';
import type { IInboundAuthValidator } from '../interfaces/inbound-auth.interface.js';

/**
 * Creates authentication middleware for Hono
 *
 * This middleware:
 * - Uses the provided validator to check incoming requests
 * - Returns 401 Unauthorized for failed authentication
 * - Adds authentication context to the request for downstream handlers
 * - Provides detailed error messages for debugging
 *
 * @param validator - The authentication validator to use
 * @returns Hono middleware function
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
 * Returns appropriate WWW-Authenticate header value based on auth type
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
 * Optional middleware to extract authentication context from requests
 * Use this if you need to access auth context in your handlers
 */
export function getAuthContext(
  c: Context,
): Record<string, unknown> | undefined {
  return c.get('authContext');
}
