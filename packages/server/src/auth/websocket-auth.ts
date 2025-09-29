/**
 * WebSocket authentication utilities
 * Validates authentication for WebSocket upgrade requests
 */

import type { IncomingMessage } from 'node:http';
import type { IInboundAuthValidator } from './interfaces/inbound-auth.interface.js';

/**
 * Minimal context interface for WebSocket auth validation
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
 * Mock context object for WebSocket auth validation
 * Adapts IncomingMessage to look like a Hono Context for validator compatibility
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
 * Validates authentication for WebSocket upgrade requests
 *
 * @param request - Incoming WebSocket upgrade request
 * @param validator - Authentication validator to use
 * @returns Promise resolving to true if authenticated, false otherwise
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
