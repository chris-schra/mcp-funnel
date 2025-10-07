import { Hono } from 'hono';
import type { MCPProxy } from 'mcp-funnel';
import { GetCallbackHandler } from './oauth/callback.js';
import { RevokeTokenHandler } from './oauth/revokeToken.js';
import ConsentRoute from './oauth/consent/index.js';
import { AuthorizeHandler } from './oauth/authorize.js';
import { RegisterHandler } from './oauth/register.js';
import { PostTokenHandler } from './oauth/token.js';
import ClientRoute from './oauth/clients/index.js';
import { MergeDeep } from 'type-fest';
import type { OAuthEnv } from './oauth/types.js';
import { MemoryOAuthStorage, MemoryUserConsentService, OAuthProvider } from '@mcp-funnel/auth';
import type { OAuthProviderConfig } from '@mcp-funnel/models';
type Variables = MergeDeep<
  {
    mcpProxy: MCPProxy;
  },
  OAuthEnv['Variables']
>;

export const oauthRoute = new Hono<{ Variables: Variables }>();

// Initialize OAuth provider (in production, this should be done at app level)
const oauthConfig: OAuthProviderConfig = {
  issuer: process.env.OAUTH_ISSUER || 'http://localhost:3000',
  baseUrl: process.env.OAUTH_BASE_URL || 'http://localhost:3000/api/oauth',
  defaultTokenExpiry: 3600, // 1 hour
  defaultCodeExpiry: 600, // 10 minutes
  defaultClientSecretExpiry: 31536000, // 1 year in seconds
  defaultRefreshTokenExpiry: 2592000, // 30 days in seconds
  requireTokenRotation: false,
  supportedScopes: ['read', 'write', 'admin'],
  requirePkce: true,
  issueRefreshTokens: true,
};

const storage = new MemoryOAuthStorage();
const consentService = new MemoryUserConsentService();
const oauthProvider = new OAuthProvider(storage, consentService, oauthConfig);

oauthRoute.use('*', async (c, next) => {
  c.set('oauthProvider', oauthProvider);
  c.set('storage', storage);
  c.set('consentService', consentService);
  c.set('oauthConfig', oauthConfig);
  await next();
});

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * GET /.well-known/oauth-authorization-server
 */
oauthRoute.get('/.well-known/oauth-authorization-server', async (c) => {
  const metadata = oauthProvider.getMetadata();
  return c.json(metadata);
});

/**
 * Client Registration endpoint (RFC 7591)
 * POST /register
 */
oauthRoute.post('/register', RegisterHandler);

/**
 * Client secret rotation endpoint
 * POST /clients/:clientId/rotate-secret
 */
oauthRoute.route('/clients', ClientRoute);

/**
 * OAuth 2.0 Authorization endpoint (RFC 6749)
 * GET /authorize
 */
oauthRoute.get('/authorize', AuthorizeHandler);

/**
 * OAuth 2.0 Token endpoint (RFC 6749)
 * POST /token
 */
oauthRoute.post('/token', PostTokenHandler);

/**
 * OAuth 2.0 Token Revocation endpoint (RFC 7009)
 * POST /revoke
 */
oauthRoute.post('/revoke', RevokeTokenHandler);

oauthRoute.route('/consent', ConsentRoute);

/**
 * OAuth2 Authorization Code callback route
 * Handles authorization code callback from OAuth providers
 * Integrates with existing MCPProxy OAuth flow completion
 */
oauthRoute.get('/callback', GetCallbackHandler);
