/**
 * WebSocket upgrade request authentication utilities.
 *
 * Provides authentication validation for WebSocket connections by adapting
 * Node.js IncomingMessage to Hono Context interface expected by validators.
 * @public
 * @see file:./middleware/auth-middleware.ts - HTTP middleware equivalent
 */

import type { IncomingMessage } from 'node:http';
import type { IInboundAuthValidator } from './interfaces/inbound-auth.interface.js';

/**
 * Minimal Hono Context subset required for authentication validation.
 * @internal
 */
interface MinimalContext {
  req: {
    header: (name: string) => string | undefined;
    path: string;
    method: string;
  };
  set: (key: string, value: unknown) => void;
  get: (key: string) => unknown;
}

/**
 * Adapts Node.js IncomingMessage to Hono Context interface for auth validators.
 *
 * Implements minimal Context subset required by IInboundAuthValidator.validateRequest.
 * Stub methods (set, get) are no-ops as validators don't use them during validation.
 * @internal
 */
class WebSocketAuthContext implements MinimalContext {
  private request: IncomingMessage;

  public constructor(request: IncomingMessage) {
    this.request = request;
  }

  public get req() {
    return {
      header: (name: string) => {
        return this.request.headers[name.toLowerCase()] as string | undefined;
      },
      path: this.request.url || '/',
      method: this.request.method || 'GET',
    };
  }

  // Stub methods not used during auth validation
  public set(_key: string, _value: unknown) {}
  public get(_key: string) {}
}

/**
 * Validates WebSocket upgrade request authentication using existing HTTP validators.
 *
 * Adapts Node.js IncomingMessage to Hono Context interface, allowing reuse of
 * HTTP authentication validators for WebSocket connections without duplication.
 * @param request - Node.js HTTP upgrade request
 * @param validator - Authentication validator instance
 * @returns Promise with authentication result and optional error message
 * @example
 * ```typescript
 * server.on('upgrade', async (request, socket, head) => \{
 *   const result = await validateWebSocketAuth(request, validator);
 *   if (!result.isAuthenticated) \{
 *     socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
 *     socket.destroy();
 *     return;
 *   \}
 *   // proceed with upgrade
 * \});
 * ```
 * @public
 */
export async function validateWebSocketAuth(
  request: IncomingMessage,
  validator: IInboundAuthValidator,
): Promise<{ isAuthenticated: boolean; error?: string }> {
  try {
    // Create a mock context that implements the subset of Hono Context
    // that our validators need
    const mockContext = new WebSocketAuthContext(request);

    // Use the existing validator - cast to Context type to satisfy interface
    // This is safe because our mock implements all the methods the validators actually use
    const result = await validator.validateRequest(
      mockContext as unknown as import('hono').Context,
    );

    return {
      isAuthenticated: result.isAuthenticated,
      error: result.error,
    };
  } catch (error) {
    console.error('WebSocket authentication error:', error);
    return {
      isAuthenticated: false,
      error: 'Authentication validation failed',
    };
  }
}
