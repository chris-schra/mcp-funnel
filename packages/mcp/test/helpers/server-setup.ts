import { createTestSSEServer } from '../fixtures/test-sse-server.js';
import { createTestWebSocketServer } from '../fixtures/test-websocket-server.js';
import { createTestOAuthServer } from '../fixtures/test-oauth-server.js';

/**
 * Sets up OAuth and SSE test servers with given credentials
 * @param config - Configuration for OAuth and SSE servers
 * @returns Promise resolving to server information objects
 */
export async function setupOAuthAndSSEServers(config: {
  clientId: string;
  clientSecret: string;
  tokenLifetime?: number;
  requireAuth?: boolean;
}) {
  const [oauthServerInfo, sseServerInfo] = await Promise.all([
    createTestOAuthServer({
      validClientId: config.clientId,
      validClientSecret: config.clientSecret,
      tokenLifetime: config.tokenLifetime || 3600,
    }),
    createTestSSEServer({
      requireAuth: config.requireAuth !== false,
    }),
  ]);

  // Verify both servers are ready
  const [oauthHealth, sseHealth] = await Promise.all([
    fetch(`${oauthServerInfo.url}/health`),
    fetch(`${sseServerInfo.url}/health`),
  ]);

  if (!oauthHealth.ok || !sseHealth.ok) {
    throw new Error('Server health checks failed during setup');
  }

  return { oauthServerInfo, sseServerInfo };
}

/**
 * Sets up OAuth and WebSocket test servers with given credentials
 * @param config - Configuration for OAuth and WebSocket servers
 * @returns Promise resolving to server information objects
 */
export async function setupOAuthAndWebSocketServers(config: {
  clientId: string;
  clientSecret: string;
  tokenLifetime?: number;
  requireAuth?: boolean;
}) {
  const [oauthServerInfo, wsServerInfo] = await Promise.all([
    createTestOAuthServer({
      validClientId: config.clientId,
      validClientSecret: config.clientSecret,
      tokenLifetime: config.tokenLifetime || 3600,
    }),
    createTestWebSocketServer({
      requireAuth: config.requireAuth !== false,
    }),
  ]);

  // Verify both servers are ready
  const [oauthHealth, wsHealth] = await Promise.all([
    fetch(`${oauthServerInfo.url}/health`),
    fetch(`${wsServerInfo.url}/health`),
  ]);

  if (!oauthHealth.ok || !wsHealth.ok) {
    throw new Error('Server health checks failed during setup');
  }

  return { oauthServerInfo, wsServerInfo };
}
