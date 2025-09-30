import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import {
  createAuthValidator,
  validateWebSocketAuth,
  type InboundBearerAuthConfig,
  type InboundNoAuthConfig,
} from '../../src/auth/index.js';

describe('WebSocket Authentication', () => {
  it('should validate WebSocket requests with valid bearer token', async () => {
    const config: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['valid-ws-token'],
    };

    const validator = createAuthValidator(config);

    const mockRequest = {
      headers: {
        authorization: 'Bearer valid-ws-token',
      },
      url: '/ws',
      method: 'GET',
    } as IncomingMessage;

    const result = await validateWebSocketAuth(mockRequest, validator);

    expect(result.isAuthenticated).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject WebSocket requests with invalid bearer token', async () => {
    const config: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['valid-ws-token'],
    };

    const validator = createAuthValidator(config);

    const mockRequest = {
      headers: {
        authorization: 'Bearer invalid-ws-token',
      },
      url: '/ws',
      method: 'GET',
    } as IncomingMessage;

    const result = await validateWebSocketAuth(mockRequest, validator);

    expect(result.isAuthenticated).toBe(false);
    expect(result.error).toBe('Invalid Bearer token');
  });

  it('should reject WebSocket requests without authentication', async () => {
    const config: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['valid-ws-token'],
    };

    const validator = createAuthValidator(config);

    const mockRequest = {
      headers: {},
      url: '/ws',
      method: 'GET',
    } as IncomingMessage;

    const result = await validateWebSocketAuth(mockRequest, validator);

    expect(result.isAuthenticated).toBe(false);
    expect(result.error).toBe('Missing Authorization header');
  });

  it('should allow WebSocket requests with no-auth validator', async () => {
    const config: InboundNoAuthConfig = {
      type: 'none',
    };

    const validator = createAuthValidator(config);

    const mockRequest = {
      headers: {},
      url: '/ws',
      method: 'GET',
    } as IncomingMessage;

    const result = await validateWebSocketAuth(mockRequest, validator);

    expect(result.isAuthenticated).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
