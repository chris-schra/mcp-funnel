import type { Context } from 'hono';
import type { OAuthHandler } from '../types.js';
import { OAuthUtils } from '@mcp-funnel/auth';
import type { IUserConsentService } from '@mcp-funnel/models';
import {
  validateRequiredParams,
  validateDecision,
  validateClient,
  validateTtl,
  validateAndDetermineRedirectUri,
  validateApprovedScopes,
} from './validations.js';

interface ConsentRequestBody {
  client_id?: unknown;
  decision?: unknown;
  action?: unknown;
  user_id?: unknown;
  state?: unknown;
  code_challenge?: unknown;
  code_challenge_method?: unknown;
  redirect_uri?: unknown;
  scopes?: unknown;
  scope?: unknown;
  approved_scopes?: unknown;
  remember_decision?: unknown;
  ttl_seconds?: unknown;
}

interface ParsedConsentParams {
  clientId: string;
  decision: string;
  userId: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  redirectUriRaw?: string;
  requestedScopes: string[];
  approvedScopeInput: string[];
  rememberDecision: boolean;
  ttlSecondsRaw?: number;
}

/**
 * Parses and validates the consent request body, extracting all relevant OAuth parameters
 *
 * @param body - Raw request body containing consent decision and OAuth parameters
 * @param c - Hono context object used to extract current user ID if not provided in body
 * @param supportedScopes - List of valid scopes supported by the OAuth server
 * @returns Parsed and normalized consent parameters with validated scopes
 */
function parseConsentRequestBody(
  body: ConsentRequestBody,
  c: Context,
  supportedScopes: string[],
): ParsedConsentParams {
  const clientId = OAuthUtils.coerceToString(body.client_id);
  const decision =
    OAuthUtils.coerceToString(body.decision) ?? OAuthUtils.coerceToString(body.action);
  const userId = OAuthUtils.coerceToString(body.user_id) ?? OAuthUtils.getCurrentUserId(c);

  const requestedScopesInput = OAuthUtils.normalizeScopeInput(body.scopes);
  const fallbackScopes = OAuthUtils.normalizeScopeInput(body.scope);
  const requestedScopes = requestedScopesInput.length > 0 ? requestedScopesInput : fallbackScopes;

  const validRequestedScopes = Array.from(
    new Set(requestedScopes.filter((scope) => supportedScopes.includes(scope))),
  );

  return {
    clientId: clientId ?? '',
    decision: decision ?? '',
    userId: userId ?? '',
    state: OAuthUtils.coerceToString(body.state),
    codeChallenge: OAuthUtils.coerceToString(body.code_challenge),
    codeChallengeMethod: OAuthUtils.coerceToString(body.code_challenge_method),
    redirectUriRaw: OAuthUtils.coerceToString(body.redirect_uri),
    requestedScopes: validRequestedScopes,
    approvedScopeInput: OAuthUtils.normalizeScopeInput(body.approved_scopes),
    rememberDecision: OAuthUtils.parseBooleanFlag(body.remember_decision),
    ttlSecondsRaw: OAuthUtils.coerceToNumber(body.ttl_seconds),
  };
}

/**
 * Processes and validates approved scopes, ensuring they are within requested and supported scopes
 *
 * @param approvedScopeInput - Scopes explicitly approved by the user (empty means approve all requested)
 * @param requestedScopes - Scopes originally requested by the OAuth client
 * @param supportedScopes - List of valid scopes supported by the OAuth server
 * @returns Deduplicated array of valid approved scopes filtered by requested and supported scopes
 */
function processApprovedScopes(
  approvedScopeInput: string[],
  requestedScopes: string[],
  supportedScopes: string[],
): string[] {
  const approvedScopes = approvedScopeInput.length > 0 ? approvedScopeInput : requestedScopes;
  const supportedApprovedScopes = approvedScopes.filter((scope) => supportedScopes.includes(scope));
  const filteredApprovedScopes =
    requestedScopes.length > 0
      ? supportedApprovedScopes.filter((scope) => requestedScopes.includes(scope))
      : supportedApprovedScopes;
  return Array.from(new Set(filteredApprovedScopes));
}

/**
 * Builds URL search parameters for redirecting to the OAuth authorize endpoint
 *
 * @param clientId - OAuth client identifier
 * @param redirectUri - URI to redirect back to after authorization
 * @param approvedScopes - Scopes approved by the user
 * @param requestedScopes - Fallback scopes if no specific scopes were approved
 * @param state - Optional state parameter for CSRF protection
 * @param codeChallenge - Optional PKCE code challenge for enhanced security
 * @param codeChallengeMethod - Method used to generate code challenge (e.g., 'S256', 'plain')
 * @returns URLSearchParams containing all authorization request parameters
 */
function buildAuthorizeParams(
  clientId: string,
  redirectUri: string,
  approvedScopes: string[],
  requestedScopes: string[],
  state?: string,
  codeChallenge?: string,
  codeChallengeMethod?: string,
): URLSearchParams {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
  });

  if (approvedScopes.length > 0) {
    params.set('scope', OAuthUtils.formatScopes(approvedScopes));
  } else if (requestedScopes.length > 0) {
    params.set('scope', OAuthUtils.formatScopes(requestedScopes));
  }

  if (state) params.set('state', state);
  if (codeChallenge) params.set('code_challenge', codeChallenge);
  if (codeChallengeMethod) params.set('code_challenge_method', codeChallengeMethod);

  return params;
}

/**
 * Handles user approval of consent, recording the decision and redirecting appropriately
 *
 * @param c - Hono context object for the current request
 * @param wantsJson - Whether the client prefers JSON response format
 * @param params - Parsed consent request parameters including user ID, client ID, and OAuth state
 * @param approvedScopes - Final list of scopes approved by the user
 * @param redirectUri - URI to redirect back to after recording consent, if available
 * @param ttlSeconds - Optional time-to-live in seconds for the consent record
 * @param consentService - Service for storing user consent decisions
 * @returns Hono response as JSON confirmation, plain text, or redirect to authorize endpoint
 */
async function handleApproval(
  c: Context,
  wantsJson: boolean,
  params: ParsedConsentParams,
  approvedScopes: string[],
  redirectUri: string | undefined,
  ttlSeconds: number | undefined,
  consentService: IUserConsentService,
) {
  if (approvedScopes.length > 0) {
    await consentService.recordUserConsent(params.userId, params.clientId, approvedScopes, {
      remember: params.rememberDecision,
      ttlSeconds,
    });
  }

  if (wantsJson) {
    return c.json({
      status: 'approved',
      message: 'Consent recorded successfully',
      consented_scopes: approvedScopes,
      remember: params.rememberDecision,
      ttl_seconds: ttlSeconds ?? null,
    });
  }

  if (!redirectUri) {
    return c.text('Consent recorded, but redirect_uri is unavailable', 200);
  }

  return c.redirect(
    `/api/oauth/authorize?${buildAuthorizeParams(
      params.clientId,
      redirectUri,
      approvedScopes,
      params.requestedScopes,
      params.state,
      params.codeChallenge,
      params.codeChallengeMethod,
    ).toString()}`,
  );
}

/**
 * Handles user denial of consent, responding with appropriate error messages
 *
 * @param c - Hono context object for the current request
 * @param wantsJson - Whether the client prefers JSON response format
 * @param params - Parsed consent request parameters including OAuth state for redirect
 * @param redirectUri - URI to redirect back to with access_denied error, if available
 * @returns Hono response as JSON error, plain text message, or redirect with error parameters
 */
function handleDenial(
  c: Context,
  wantsJson: boolean,
  params: ParsedConsentParams,
  redirectUri: string | undefined,
) {
  if (wantsJson) {
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
    errorRedirect.searchParams.set('error_description', 'The resource owner denied the request');
    if (params.state) errorRedirect.searchParams.set('state', params.state);
    return c.redirect(errorRedirect.toString());
  }

  return c.text('Consent denied', 200);
}

export const PostConsentHandler: OAuthHandler = async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    const wantsJson = contentType.includes('application/json') || OAuthUtils.prefersJsonResponse(c);
    const rawBody: unknown = contentType.includes('application/json')
      ? await c.req.json()
      : await c.req.parseBody();

    const storage = c.get('storage');
    const consentService = c.get('consentService');
    const oauthConfig = c.get('oauthConfig');
    const params = parseConsentRequestBody(
      (rawBody as ConsentRequestBody) ?? {},
      c,
      oauthConfig.supportedScopes,
    );

    const requiredParamsError = validateRequiredParams(params, c, wantsJson);
    if (requiredParamsError) return requiredParamsError;

    const decisionError = validateDecision(params.decision, c, wantsJson);
    if (decisionError) return decisionError;

    const [client, clientError] = await validateClient(params.clientId, storage, c, wantsJson);
    if (clientError) return clientError;

    const ttlError = validateTtl(params.ttlSecondsRaw, c, wantsJson);
    if (ttlError) return ttlError;

    const [redirectUri, redirectUriError] = validateAndDetermineRedirectUri(
      params.redirectUriRaw,
      client,
      c,
      wantsJson,
    );
    if (redirectUriError) return redirectUriError;

    const approvedScopes = processApprovedScopes(
      params.approvedScopeInput,
      params.requestedScopes,
      oauthConfig.supportedScopes,
    );

    if (params.decision === 'approve') {
      const approvedScopesError = validateApprovedScopes(
        params.requestedScopes,
        approvedScopes,
        c,
        wantsJson,
      );
      if (approvedScopesError) return approvedScopesError;

      return handleApproval(
        c,
        wantsJson,
        params,
        approvedScopes,
        redirectUri,
        params.ttlSecondsRaw || undefined,
        consentService,
      );
    }

    return handleDenial(c, wantsJson, params, redirectUri);
  } catch (error) {
    console.error('Consent processing error:', error);
    return c.json({ error: 'server_error', error_description: 'Internal server error' }, 500);
  }
};
