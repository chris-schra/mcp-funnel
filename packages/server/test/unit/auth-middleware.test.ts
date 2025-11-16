import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  createAuthValidator,
  createAuthMiddleware,
  type InboundBearerAuthConfig,
  type InboundNoAuthConfig,
} from '../../src/auth/index.js';

describe('Auth Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it('should allow requests with valid authentication', async () => {
    const config: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['valid-token'],
    };

    const validator = createAuthValidator(config);
    const middleware = createAuthMiddleware(validator);

    app.use('*', middleware);
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test', {
      headers: {
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('should reject requests with invalid authentication', async () => {
    const config: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['valid-token'],
    };

    const validator = createAuthValidator(config);
    const middleware = createAuthMiddleware(validator);

    app.use('*', middleware);
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test', {
      headers: {
        Authorization: 'Bearer invalid-token',
      },
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm="MCP Proxy API"');
  });

  it('should reject requests without authentication', async () => {
    const config: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['valid-token'],
    };

    const validator = createAuthValidator(config);
    const middleware = createAuthMiddleware(validator);

    app.use('*', middleware);
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test');

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should allow all requests with no-auth validator', async () => {
    const config: InboundNoAuthConfig = {
      type: 'none',
    };

    const validator = createAuthValidator(config);
    const middleware = createAuthMiddleware(validator);

    app.use('*', middleware);
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
