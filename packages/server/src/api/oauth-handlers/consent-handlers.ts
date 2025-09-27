/**
 * OAuth consent management handlers
 */

import type { Context } from 'hono';
import type {
  IOAuthProviderStorage,
  IUserConsentService,
  OAuthProviderConfig,
} from '../../types/oauth-provider.js';
import {
  parseScopes,
  formatScopes,
  validateRedirectUri,
} from '../../oauth/utils/oauth-utils.js';
import {
  createConsentPageData,
  renderConsentPage,
} from '../../oauth/ui/consent-template.js';
import {
  prefersJsonResponse,
  getCurrentUserId,
  coerceToString,
  normalizeScopeInput,
  parseBooleanFlag,
  coerceToNumber,
} from './request-utils.js';

/**
 * Handle OAuth 2.0 Consent endpoint - Retrieve consent request details
 * GET /consent
 */
export async function handleConsentRequest(
  c: Context,
  storage: IOAuthProviderStorage,
  consentService: IUserConsentService,
  oauthConfig: OAuthProviderConfig,
) {
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
}

/**
 * Process user consent decision
 * POST /consent
 */
export async function handleConsentProcessing(
  c: Context,
  storage: IOAuthProviderStorage,
  consentService: IUserConsentService,
  oauthConfig: OAuthProviderConfig,
) {
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

    const scopeProcessingResult = processScopeParams(body, oauthConfig);
    const rememberDecision = parseBooleanFlag(body.remember_decision);
    const ttlSecondsRaw = coerceToNumber(body.ttl_seconds);
    let ttlSeconds: number | undefined;

    if (ttlSecondsRaw !== undefined) {
      if (ttlSecondsRaw < 0) {
        const errorBody = {
          error: 'invalid_request',
          error_description: 'ttl_seconds must be a non-negative number',
        } as const;
        return wantsJsonResponse
          ? c.json(errorBody, 400)
          : c.text('Invalid ttl_seconds value', 400);
      }
      ttlSeconds = ttlSecondsRaw;
    }

    const redirectUri = getValidatedRedirectUri(client, redirectUriRaw);
    if (redirectUriRaw && !redirectUri) {
      const errorBody = {
        error: 'invalid_request',
        error_description: 'redirect_uri is not registered for this client',
      } as const;
      return wantsJsonResponse
        ? c.json(errorBody, 400)
        : c.text('Invalid redirect_uri', 400);
    }

    if (decision === 'approve') {
      return await handleConsentApproval(
        c,
        consentService,
        userId,
        clientId,
        scopeProcessingResult,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        rememberDecision,
        ttlSeconds,
        wantsJsonResponse,
      );
    }

    // Handle denial
    return handleConsentDenial(c, redirectUri, state, wantsJsonResponse);
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
}

/**
 * Handle consent revocation
 * POST /consent/revoke
 */
export async function handleConsentRevocation(
  c: Context,
  storage: IOAuthProviderStorage,
  consentService: IUserConsentService,
  oauthConfig: OAuthProviderConfig,
) {
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
}

/**
 * Process scope parameters from consent request
 */
function processScopeParams(
  body: Record<string, unknown>,
  oauthConfig: OAuthProviderConfig,
) {
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

  return {
    validRequestedScopes,
    uniqueApprovedScopes,
  };
}

/**
 * Get validated redirect URI
 */
function getValidatedRedirectUri(
  client: any,
  redirectUriRaw?: string,
): string | undefined {
  if (redirectUriRaw) {
    return validateRedirectUri(client, redirectUriRaw)
      ? redirectUriRaw
      : undefined;
  }
  return client.redirect_uris.length > 0 ? client.redirect_uris[0] : undefined;
}

/**
 * Handle consent approval
 */
async function handleConsentApproval(
  c: Context,
  consentService: IUserConsentService,
  userId: string,
  clientId: string,
  scopeProcessingResult: {
    validRequestedScopes: string[];
    uniqueApprovedScopes: string[];
  },
  redirectUri: string | undefined,
  state: string | undefined,
  codeChallenge: string | undefined,
  codeChallengeMethod: string | undefined,
  rememberDecision: boolean,
  ttlSeconds: number | undefined,
  wantsJsonResponse: boolean,
) {
  const { validRequestedScopes, uniqueApprovedScopes } = scopeProcessingResult;

  if (validRequestedScopes.length > 0 && uniqueApprovedScopes.length === 0) {
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

  const authorizeParams = buildAuthorizeParams(
    clientId,
    redirectUri,
    uniqueApprovedScopes,
    validRequestedScopes,
    state,
    codeChallenge,
    codeChallengeMethod,
  );

  return c.redirect(`/api/oauth/authorize?${authorizeParams.toString()}`);
}

/**
 * Handle consent denial
 */
function handleConsentDenial(
  c: Context,
  redirectUri: string | undefined,
  state: string | undefined,
  wantsJsonResponse: boolean,
) {
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
}

/**
 * Build authorization parameters for redirect
 */
function buildAuthorizeParams(
  clientId: string,
  redirectUri: string,
  uniqueApprovedScopes: string[],
  validRequestedScopes: string[],
  state: string | undefined,
  codeChallenge: string | undefined,
  codeChallengeMethod: string | undefined,
): URLSearchParams {
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

  return authorizeParams;
}
