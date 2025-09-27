import { Hono } from 'hono';
import type { MCPProxy } from 'mcp-funnel';
import { OAuthProvider } from '../oauth/oauth-provider.js';
import { MemoryOAuthStorage } from '../oauth/storage/memory-oauth-storage.js';
import { MemoryUserConsentService } from '../oauth/services/memory-consent-service.js';
import type { OAuthProviderConfig } from '../types/oauth-provider.js';

// Import extracted handlers
import { handleMetadataRequest } from './oauth-handlers/metadata-handlers.js';
import {
  handleTokenRequest,
  handleTokenRevocation,
  handleClientRegistration,
  handleClientSecretRotation,
} from './oauth-handlers/token-handlers.js';
import {
  handleAuthorizationRequest,
  handleAuthorizationCallback,
} from './oauth-handlers/authorization-handlers.js';
import {
  handleConsentRequest,
  handleConsentProcessing,
  handleConsentRevocation,
} from './oauth-handlers/consent-handlers.js';

type Variables = {
  mcpProxy: MCPProxy;
};

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

// OAuth 2.0 Authorization Server Metadata (RFC 8414)
oauthRoute.get('/.well-known/oauth-authorization-server', (c) =>
  handleMetadataRequest(c, oauthProvider),
);

// Client Registration endpoint (RFC 7591)
oauthRoute.post('/register', (c) => handleClientRegistration(c, oauthProvider));

// Client secret rotation endpoint
oauthRoute.post('/clients/:clientId/rotate-secret', (c) =>
  handleClientSecretRotation(c, oauthProvider),
);

// OAuth 2.0 Authorization endpoint (RFC 6749)
oauthRoute.get('/authorize', (c) =>
  handleAuthorizationRequest(c, oauthProvider),
);

// OAuth 2.0 Token endpoint (RFC 6749)
oauthRoute.post('/token', (c) => handleTokenRequest(c, oauthProvider));

// OAuth 2.0 Token Revocation endpoint (RFC 7009)
oauthRoute.post('/revoke', (c) => handleTokenRevocation(c, oauthProvider));

// OAuth 2.0 Consent endpoint - Retrieve consent request details
oauthRoute.get('/consent', (c) =>
  handleConsentRequest(c, storage, consentService, oauthConfig),
);

// OAuth 2.0 Consent Processing endpoint - Process user consent decision
oauthRoute.post('/consent', (c) =>
  handleConsentProcessing(c, storage, consentService, oauthConfig),
);

// OAuth 2.0 Consent Revocation endpoint - Revoke existing consent
oauthRoute.post('/consent/revoke', (c) =>
  handleConsentRevocation(c, storage, consentService, oauthConfig),
);

// OAuth2 Authorization Code callback route
// Handles authorization code callback from OAuth providers
// Integrates with existing MCPProxy OAuth flow completion
oauthRoute.get('/callback', (c) => handleAuthorizationCallback(c));
