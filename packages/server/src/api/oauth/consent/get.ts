import type { Context, Handler } from 'hono';
import { createConsentPageData, OAuthUtils, renderConsentPage } from '@mcp-funnel/auth';

/**
 * Validates client_id parameter and retrieves the client
 *
 * @param c - Hono context object for the current request
 * @param clientId - OAuth client identifier to validate
 * @returns Tuple of [client, error] - one will be null
 */
async function validateClient(c: Context, clientId: string | undefined) {
  if (!clientId) {
    const errorBody = {
      error: 'invalid_request',
      error_description: 'Missing required parameter: client_id',
    };
    const error = OAuthUtils.prefersJsonResponse(c)
      ? c.json(errorBody, 400)
      : c.text('Missing client_id', 400);
    return [null, error] as const;
  }

  const storage = c.get('storage');
  const client = await storage.getClient(clientId);

  if (!client) {
    const errorBody = {
      error: 'invalid_client',
      error_description: 'Unknown client',
    };
    const error = OAuthUtils.prefersJsonResponse(c)
      ? c.json(errorBody, 400)
      : c.text('Unknown client', 400);
    return [null, error] as const;
  }

  return [client, null] as const;
}

/**
 * Validates user authentication
 *
 * @param c - Hono context object for the current request
 * @returns Tuple of [userId, error] - one will be null
 */
function validateUser(c: Context) {
  const userId = OAuthUtils.getCurrentUserId(c);

  if (!userId) {
    const errorBody = {
      error: 'unauthorized',
      error_description: 'User authentication required',
    };
    const error = OAuthUtils.prefersJsonResponse(c)
      ? c.json(errorBody, 401)
      : c.text('User authentication required', 401);
    return [null, error] as const;
  }

  return [userId, null] as const;
}

export const GetConsentHandler: Handler = async (c) => {
  try {
    const consentService = c.get('consentService');
    const oauthConfig = c.get('oauthConfig');

    const clientId = c.req.query('client_id');
    const scopeParam = c.req.query('scope');
    const state = c.req.query('state');
    const redirectUriParam = c.req.query('redirect_uri');
    const codeChallenge = c.req.query('code_challenge');
    const codeChallengeMethod = c.req.query('code_challenge_method');

    const [client, clientError] = await validateClient(c, clientId);
    if (clientError) return clientError;

    const [userId, userError] = validateUser(c);
    if (userError) return userError;

    const requestedScopes = OAuthUtils.parseScopes(scopeParam);
    const validScopes = requestedScopes.filter((requestedScope) =>
      oauthConfig.supportedScopes.includes(requestedScope),
    );

    const hasConsented = await consentService.hasUserConsented(
      userId,
      client.client_id,
      validScopes,
    );

    const redirectUri =
      redirectUriParam && OAuthUtils.validateRedirectUri(client, redirectUriParam)
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

    if (OAuthUtils.prefersJsonResponse(c)) {
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
};
