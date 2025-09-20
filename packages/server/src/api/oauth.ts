import { Hono } from 'hono';
import type { MCPProxy } from 'mcp-funnel';
import { OAuthProvider } from '../oauth/oauth-provider.js';
import { MemoryOAuthStorage } from '../oauth/storage/memory-oauth-storage.js';
import { MemoryUserConsentService } from '../oauth/services/memory-consent-service.js';
import type { OAuthProviderConfig } from '../types/oauth-provider.js';
import { OAuthErrorCodes } from '../types/oauth-provider.js';
import {
  createOAuthErrorResponse,
  createTokenResponse,
  formatScopes,
  parseScopes,
  validateRedirectUri,
} from '../oauth/utils/oauth-utils.js';
import {
  createConsentPageData,
  renderConsentPage,
} from '../oauth/ui/consent-template.js';

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

// Placeholder for user authentication - in production, integrate with your auth system
function getCurrentUserId(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  // This is a simplified implementation
  // In production, extract from session, JWT, or other auth mechanism
  return c.req.header('X-User-ID') || 'test-user-123';
}

function prefersJsonResponse(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}): boolean {
  const format = c.req.query('format');
  if (format && format.toLowerCase() === 'json') {
    return true;
  }

  const accept = c.req.header('accept');
  return accept !== undefined && accept.includes('application/json');
}

function coerceToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const coerced = coerceToString(entry);
      if (coerced) {
        return coerced;
      }
    }
  }

  return undefined;
}

function parseBooleanFlag(value: unknown): boolean {
  const normalized = coerceToString(value);
  if (!normalized) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  return (
    lowered === 'true' ||
    lowered === '1' ||
    lowered === 'yes' ||
    lowered === 'on'
  );
}

function normalizeScopeInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    const scoped: string[] = [];
    for (const entry of value) {
      const converted = coerceToString(entry);
      if (converted) {
        scoped.push(...parseScopes(converted));
      }
    }
    return scoped;
  }

  const single = coerceToString(value);
  return single ? parseScopes(single) : [];
}

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
oauthRoute.post('/register', async (c) => {
  try {
    const body = await c.req.json();

    // Basic validation
    if (
      !body.redirect_uris ||
      !Array.isArray(body.redirect_uris) ||
      body.redirect_uris.length === 0
    ) {
      return c.json(
        {
          error: 'invalid_request',
          error_description:
            'redirect_uris is required and must be a non-empty array',
        },
        400,
      );
    }

    const client = await oauthProvider.registerClient({
      client_name: body.client_name,
      redirect_uris: body.redirect_uris,
      grant_types: body.grant_types,
      response_types: body.response_types,
      scope: body.scope,
    });

    // Don't expose sensitive fields in response
    const response = {
      client_id: client.client_id,
      client_secret: client.client_secret,
      client_id_issued_at: client.client_id_issued_at,
      client_secret_expires_at: client.client_secret_expires_at,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      scope: client.scope,
    };

    return c.json(response, 201);
  } catch (error) {
    console.error('Client registration error:', error);
    return c.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      500,
    );
  }
});

/**
 * Client secret rotation endpoint
 * POST /clients/:clientId/rotate-secret
 */
oauthRoute.post('/clients/:clientId/rotate-secret', async (c) => {
  try {
    const { clientId } = c.req.param();
    const body = await c.req.json();
    const currentSecret = body.client_secret as string | undefined;

    if (!clientId || !currentSecret) {
      return c.json(
        {
          error: 'invalid_request',
          error_description: 'Missing required parameters',
        },
        400,
      );
    }

    const result = await oauthProvider.rotateClientSecret(
      clientId,
      currentSecret,
    );

    if (!result.success) {
      const status =
        result.error?.error === OAuthErrorCodes.INVALID_CLIENT ? 401 : 400;
      const errorResponse = createOAuthErrorResponse(result.error!, status);
      return c.json(
        errorResponse.body,
        errorResponse.status as 400 | 401 | 403 | 500,
      );
    }

    const updatedClient = result.client!;

    return c.json(
      {
        client_id: updatedClient.client_id,
        client_secret: updatedClient.client_secret,
        client_secret_expires_at: updatedClient.client_secret_expires_at,
        client_id_issued_at: updatedClient.client_id_issued_at,
        client_name: updatedClient.client_name,
        redirect_uris: updatedClient.redirect_uris,
        grant_types: updatedClient.grant_types,
        response_types: updatedClient.response_types,
        scope: updatedClient.scope,
      },
      200,
    );
  } catch (error) {
    console.error('Client secret rotation error:', error);
    return c.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      500,
    );
  }
});

/**
 * OAuth 2.0 Authorization endpoint (RFC 6749)
 * GET /authorize
 */
oauthRoute.get('/authorize', async (c) => {
  try {
    // Get user ID (in production, ensure user is authenticated)
    const userId = getCurrentUserId(c);
    if (!userId) {
      // Redirect to login page
      return c.redirect('/login?redirect=' + encodeURIComponent(c.req.url));
    }

    const params = {
      response_type: c.req.query('response_type'),
      client_id: c.req.query('client_id'),
      redirect_uri: c.req.query('redirect_uri'),
      scope: c.req.query('scope'),
      state: c.req.query('state'),
      code_challenge: c.req.query('code_challenge'),
      code_challenge_method: c.req.query('code_challenge_method'),
    };

    const result = await oauthProvider.handleAuthorizationRequest(
      params,
      userId,
    );

    if (!result.success) {
      // Build error redirect URI
      const redirectUri = new URL(params.redirect_uri || 'about:blank');
      redirectUri.searchParams.set('error', result.error!.error);
      if (result.error!.error_description) {
        redirectUri.searchParams.set(
          'error_description',
          result.error!.error_description,
        );
      }
      if (params.state) {
        redirectUri.searchParams.set('state', params.state);
      }
      return c.redirect(redirectUri.toString());
    }

    // Build success redirect URI
    const redirectUri = new URL(result.redirectUri!);
    redirectUri.searchParams.set('code', result.authorizationCode!);
    if (result.state) {
      redirectUri.searchParams.set('state', result.state);
    }

    return c.redirect(redirectUri.toString());
  } catch (error) {
    console.error('Authorization error:', error);
    const redirectUri = c.req.query('redirect_uri');
    if (redirectUri) {
      const errorRedirect = new URL(redirectUri);
      errorRedirect.searchParams.set('error', 'server_error');
      errorRedirect.searchParams.set(
        'error_description',
        'Internal server error',
      );
      if (c.req.query('state')) {
        errorRedirect.searchParams.set('state', c.req.query('state')!);
      }
      return c.redirect(errorRedirect.toString());
    }
    return c.text('Internal server error', 500);
  }
});

/**
 * OAuth 2.0 Token endpoint (RFC 6749)
 * POST /token
 */
oauthRoute.post('/token', async (c) => {
  try {
    const body = await c.req.parseBody();

    const params = {
      grant_type: body.grant_type as string,
      code: body.code as string,
      redirect_uri: body.redirect_uri as string,
      client_id: body.client_id as string,
      client_secret: body.client_secret as string,
      code_verifier: body.code_verifier as string,
      refresh_token: body.refresh_token as string,
      scope: body.scope as string,
    };

    const result = await oauthProvider.handleTokenRequest(params);

    if (!result.success) {
      const errorResponse = createOAuthErrorResponse(result.error!);
      return c.json(
        errorResponse.body,
        errorResponse.status as 400 | 401 | 403 | 500,
      );
    }

    const tokenResponse = createTokenResponse(
      result.tokenResponse! as unknown as Record<string, unknown>,
    );
    return c.json(tokenResponse.body, tokenResponse.status as 200);
  } catch (error) {
    console.error('Token endpoint error:', error);
    const errorResponse = createOAuthErrorResponse(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      500,
    );
    return c.json(errorResponse.body, errorResponse.status as 500);
  }
});

/**
 * OAuth 2.0 Token Revocation endpoint (RFC 7009)
 * POST /revoke
 */
oauthRoute.post('/revoke', async (c) => {
  try {
    const body = await c.req.parseBody();

    const token = body.token as string;
    const clientId = body.client_id as string;

    if (!token || !clientId) {
      return c.json(
        {
          error: 'invalid_request',
          error_description: 'Missing required parameters',
        },
        400,
      );
    }

    await oauthProvider.revokeToken(token, clientId);

    // RFC 7009 specifies that successful revocation returns 200 with empty body
    return c.text('', 200);
  } catch (error) {
    console.error('Token revocation error:', error);
    return c.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      500,
    );
  }
});

/**
 * OAuth 2.0 Consent endpoint
 * GET /consent - Retrieve consent request details
 */
oauthRoute.get('/consent', async (c) => {
  try {
    const clientId = c.req.query('client_id');
    const scopeParam = c.req.query('scope');
    const state = c.req.query('state');
    const redirectUriParam = c.req.query('redirect_uri');
    const codeChallenge = c.req.query('code_challenge');
    const codeChallengeMethod = c.req.query('code_challenge_method');

    if (!clientId) {
      const errorBody = {
        error: 'invalid_request',
        error_description: 'Missing required parameter: client_id',
      } as const;
      return prefersJsonResponse(c)
        ? c.json(errorBody, 400)
        : c.text('Missing client_id', 400);
    }

    const client = await storage.getClient(clientId);
    if (!client) {
      const errorBody = {
        error: 'invalid_client',
        error_description: 'Unknown client',
      } as const;
      return prefersJsonResponse(c)
        ? c.json(errorBody, 400)
        : c.text('Unknown client', 400);
    }

    const userId = getCurrentUserId(c);
    if (!userId) {
      const errorBody = {
        error: 'unauthorized',
        error_description: 'User authentication required',
      } as const;
      return prefersJsonResponse(c)
        ? c.json(errorBody, 401)
        : c.text('User authentication required', 401);
    }

    const requestedScopes = parseScopes(scopeParam);
    const validScopes = requestedScopes.filter((requestedScope) =>
      oauthConfig.supportedScopes.includes(requestedScope),
    );

    const hasConsented = await consentService.hasUserConsented(
      userId,
      clientId,
      validScopes,
    );

    const redirectUri =
      redirectUriParam && validateRedirectUri(client, redirectUriParam)
        ? redirectUriParam
        : client.redirect_uris[0];

    const metadataResponse = {
      client: {
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
      },
      requested_scopes: validScopes,
      supported_scopes: oauthConfig.supportedScopes,
      has_consented: hasConsented,
      state: state ?? null,
      redirect_uri: redirectUri ?? null,
      code_challenge: codeChallenge ?? null,
      code_challenge_method: codeChallengeMethod ?? null,
    };

    if (prefersJsonResponse(c)) {
      return c.json(metadataResponse);
    }

    if (!redirectUri) {
      return c.text('Client is missing a registered redirect URI', 400);
    }

    const requestUrl = new URL(c.req.url);
    const consentPageData = createConsentPageData({
      clientId: client.client_id,
      clientName: client.client_name ?? client.client_id,
      userEmail: userId,
      requestedScopes: validScopes,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      baseUrl: requestUrl.origin,
    });

    const consentHtml = renderConsentPage(consentPageData);
    return c.html(consentHtml);
  } catch (error) {
    console.error('Consent endpoint error:', error);
    return c.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      500,
    );
  }
});

/**
 * OAuth 2.0 Consent Processing endpoint
 * POST /consent - Process user consent decision
 */
oauthRoute.post('/consent', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    const isJsonRequest = contentType.includes('application/json');
    const wantsJsonResponse = isJsonRequest || prefersJsonResponse(c);
    const rawBody: unknown = isJsonRequest
      ? await c.req.json()
      : await c.req.parseBody();

    const body = (rawBody as Record<string, unknown>) ?? {};

    const clientId = coerceToString(body.client_id);
    const decision =
      coerceToString(body.decision) ?? coerceToString(body.action);
    const userId = coerceToString(body.user_id) ?? getCurrentUserId(c);
    const state = coerceToString(body.state);
    const codeChallenge = coerceToString(body.code_challenge);
    const codeChallengeMethod = coerceToString(body.code_challenge_method);
    const redirectUriRaw = coerceToString(body.redirect_uri);

    if (!clientId || !decision || !userId) {
      const errorBody = {
        error: 'invalid_request',
        error_description:
          'Missing required parameters: client_id, decision, user_id',
      } as const;
      return wantsJsonResponse
        ? c.json(errorBody, 400)
        : c.text('Missing required consent parameters', 400);
    }

    if (decision !== 'approve' && decision !== 'deny') {
      const errorBody = {
        error: 'invalid_request',
        error_description: 'Decision must be either "approve" or "deny"',
      } as const;
      return wantsJsonResponse
        ? c.json(errorBody, 400)
        : c.text('Invalid consent decision', 400);
    }

    const client = await storage.getClient(clientId);
    if (!client) {
      const errorBody = {
        error: 'invalid_client',
        error_description: 'Unknown client',
      } as const;
      return wantsJsonResponse
        ? c.json(errorBody, 400)
        : c.text('Unknown client', 400);
    }

    const requestedScopesInput = normalizeScopeInput(body.scopes);
    const fallbackScopes = normalizeScopeInput(body.scope);
    const requestedScopes =
      requestedScopesInput.length > 0 ? requestedScopesInput : fallbackScopes;

    const validRequestedScopes = Array.from(
      new Set(
        requestedScopes.filter((scope) =>
          oauthConfig.supportedScopes.includes(scope),
        ),
      ),
    );

    const approvedScopeInput = normalizeScopeInput(body.approved_scopes);
    const approvedScopes =
      approvedScopeInput.length > 0 ? approvedScopeInput : validRequestedScopes;
    const supportedApprovedScopes = approvedScopes.filter((scope) =>
      oauthConfig.supportedScopes.includes(scope),
    );
    const filteredApprovedScopes =
      validRequestedScopes.length > 0
        ? supportedApprovedScopes.filter((scope) =>
            validRequestedScopes.includes(scope),
          )
        : supportedApprovedScopes;
    const uniqueApprovedScopes = Array.from(new Set(filteredApprovedScopes));

    const rememberDecision = parseBooleanFlag(body.remember_decision);
    const ttlSecondsRaw = coerceToString(body.ttl_seconds);
    let ttlSeconds: number | undefined;

    if (ttlSecondsRaw !== undefined) {
      const parsed = Number(ttlSecondsRaw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        const errorBody = {
          error: 'invalid_request',
          error_description: 'ttl_seconds must be a non-negative number',
        } as const;
        return wantsJsonResponse
          ? c.json(errorBody, 400)
          : c.text('Invalid ttl_seconds value', 400);
      }
      ttlSeconds = parsed;
    }

    let redirectUri: string | undefined;
    if (redirectUriRaw) {
      if (!validateRedirectUri(client, redirectUriRaw)) {
        const errorBody = {
          error: 'invalid_request',
          error_description: 'redirect_uri is not registered for this client',
        } as const;
        return wantsJsonResponse
          ? c.json(errorBody, 400)
          : c.text('Invalid redirect_uri', 400);
      }
      redirectUri = redirectUriRaw;
    } else if (client.redirect_uris.length > 0) {
      [redirectUri] = client.redirect_uris;
    }

    if (decision === 'approve') {
      if (
        validRequestedScopes.length > 0 &&
        uniqueApprovedScopes.length === 0
      ) {
        const errorBody = {
          error: 'invalid_request',
          error_description:
            'Approved scopes must be a subset of the requested scopes',
        } as const;
        return wantsJsonResponse
          ? c.json(errorBody, 400)
          : c.text('No valid scopes approved', 400);
      }

      if (uniqueApprovedScopes.length > 0) {
        await consentService.recordUserConsent(
          userId,
          clientId,
          uniqueApprovedScopes,
          {
            remember: rememberDecision,
            ttlSeconds,
          },
        );
      }

      if (wantsJsonResponse) {
        return c.json({
          status: 'approved',
          message: 'Consent recorded successfully',
          consented_scopes: uniqueApprovedScopes,
          remember: rememberDecision,
          ttl_seconds: ttlSeconds ?? null,
        });
      }

      if (!redirectUri) {
        return c.text('Consent recorded, but redirect_uri is unavailable', 200);
      }

      const authorizeParams = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
      });

      authorizeParams.set('redirect_uri', redirectUri);

      if (uniqueApprovedScopes.length > 0) {
        authorizeParams.set('scope', formatScopes(uniqueApprovedScopes));
      } else if (validRequestedScopes.length > 0) {
        authorizeParams.set('scope', formatScopes(validRequestedScopes));
      }

      if (state) {
        authorizeParams.set('state', state);
      }

      if (codeChallenge) {
        authorizeParams.set('code_challenge', codeChallenge);
      }

      if (codeChallengeMethod) {
        authorizeParams.set('code_challenge_method', codeChallengeMethod);
      }

      return c.redirect(`/api/oauth/authorize?${authorizeParams.toString()}`);
    }

    // Deny path
    if (wantsJsonResponse) {
      return c.json({
        status: 'denied',
        message: 'Consent denied by user',
        error: 'access_denied',
        error_description: 'The resource owner denied the request',
      });
    }

    if (redirectUri) {
      const errorRedirect = new URL(redirectUri);
      errorRedirect.searchParams.set('error', 'access_denied');
      errorRedirect.searchParams.set(
        'error_description',
        'The resource owner denied the request',
      );
      if (state) {
        errorRedirect.searchParams.set('state', state);
      }
      return c.redirect(errorRedirect.toString());
    }

    return c.text('Consent denied', 200);
  } catch (error) {
    console.error('Consent processing error:', error);
    return c.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      500,
    );
  }
});

/**
 * OAuth 2.0 Consent Revocation endpoint
 * POST /consent/revoke - Revoke existing consent
 */
oauthRoute.post('/consent/revoke', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    const isJsonRequest = contentType.includes('application/json');
    const rawBody: unknown = isJsonRequest
      ? await c.req.json()
      : await c.req.parseBody();

    const body = (rawBody as Record<string, unknown>) ?? {};
    const clientId = coerceToString(body.client_id);
    const userId = coerceToString(body.user_id) ?? getCurrentUserId(c);

    if (!clientId || !userId) {
      return c.json(
        {
          error: 'invalid_request',
          error_description: 'Missing required parameters: client_id, user_id',
        },
        400,
      );
    }

    const client = await storage.getClient(clientId);
    if (!client) {
      return c.json(
        {
          error: 'invalid_client',
          error_description: 'Unknown client',
        },
        400,
      );
    }

    const scopesToRevoke = normalizeScopeInput(body.scopes);
    const fallbackScopes = normalizeScopeInput(body.scope);
    const combinedScopes = scopesToRevoke.length
      ? scopesToRevoke
      : fallbackScopes;
    const validScopes = combinedScopes.filter((scope) =>
      oauthConfig.supportedScopes.includes(scope),
    );

    await consentService.revokeUserConsent(
      userId,
      clientId,
      validScopes.length > 0 ? validScopes : undefined,
    );

    return c.json({
      status: 'success',
      message: validScopes.length
        ? 'Consent scopes revoked successfully'
        : 'Consent revoked successfully',
      revoked_scopes: validScopes,
    });
  } catch (error) {
    console.error('Consent revocation error:', error);
    return c.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      500,
    );
  }
});

/**
 * OAuth2 Authorization Code callback route
 * Handles authorization code callback from OAuth providers
 * Integrates with existing MCPProxy OAuth flow completion
 */
oauthRoute.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  // Handle OAuth error responses
  if (error) {
    const errorMsg = errorDescription || error;
    console.error(`OAuth authorization failed: ${errorMsg}`);

    return c.html(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Authorization Failed</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px; margin: 100px auto; padding: 20px;
            text-align: center; color: #333;
          }
          .error { color: #d32f2f; background: #ffebee; padding: 16px; border-radius: 4px; margin: 20px 0; }
          .code { font-family: 'Monaco', 'Menlo', monospace; background: #f5f5f5; padding: 4px 8px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h1>❌ Authorization Failed</h1>
        <div class="error">
          <strong>Error:</strong> <span class="code">${error}</span><br>
          ${errorDescription ? `<strong>Description:</strong> ${errorDescription}` : ''}
        </div>
        <p>You can close this window and try again.</p>
      </body>
      </html>
    `,
      400,
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return c.html(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invalid Request</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px; margin: 100px auto; padding: 20px;
            text-align: center; color: #333;
          }
          .error { color: #d32f2f; background: #ffebee; padding: 16px; border-radius: 4px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>❌ Invalid Request</h1>
        <div class="error">
          Missing required parameters: code or state
        </div>
        <p>You can close this window and try again.</p>
      </body>
      </html>
    `,
      400,
    );
  }

  try {
    const mcpProxy = c.get('mcpProxy');

    // Complete OAuth flow through MCPProxy
    await mcpProxy.completeOAuthFlow(state, code);

    // Return success page
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Authorization Successful</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px; margin: 100px auto; padding: 20px;
            text-align: center; color: #333;
          }
          .success { color: #388e3c; background: #e8f5e8; padding: 16px; border-radius: 4px; margin: 20px 0; }
          .next-steps { text-align: left; background: #f5f5f5; padding: 16px; border-radius: 4px; margin: 20px 0; }
          .code { font-family: 'Monaco', 'Menlo', monospace; background: #ffffff; padding: 2px 4px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h1>✅ Authorization Successful!</h1>
        <div class="success">
          Your authorization has been completed successfully.
        </div>
        <div class="next-steps">
          <h3>Next Steps:</h3>
          <ol>
            <li>You can close this browser window</li>
            <li>Return to your terminal - the authentication process should continue automatically</li>
            <li>Your credentials are now configured and ready to use</li>
          </ol>
        </div>
        <p><strong>You can safely close this window.</strong></p>
        <script>
          // Auto-close after 3 seconds for better UX
          setTimeout(function() {
            window.close();
          }, 3000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return c.html(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Authentication Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px; margin: 100px auto; padding: 20px;
            text-align: center; color: #333;
          }
          .error { color: #d32f2f; background: #ffebee; padding: 16px; border-radius: 4px; margin: 20px 0; }
          .details { font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; background: #f5f5f5; padding: 12px; border-radius: 4px; margin: 20px 0; text-align: left; }
        </style>
      </head>
      <body>
        <h1>❌ Authentication Error</h1>
        <div class="error">
          An error occurred while completing the authorization process.
        </div>
        <div class="details">${errorMessage}</div>
        <p>You can close this window and try again.</p>
      </body>
      </html>
    `,
      500,
    );
  }
});
