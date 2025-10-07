import type { OAuthHandler } from '../types.js';
import { OAuthUtils } from '@mcp-funnel/auth';

export const PostConsentHandler: OAuthHandler = async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    const isJsonRequest = contentType.includes('application/json');
    const wantsJsonResponse = isJsonRequest || OAuthUtils.prefersJsonResponse(c);
    const rawBody: unknown = isJsonRequest ? await c.req.json() : await c.req.parseBody();

    const storage = c.get('storage');
    const consentService = c.get('consentService');
    const oauthConfig = c.get('oauthConfig');

    const body = (rawBody as Record<string, unknown>) ?? {};

    const clientId = OAuthUtils.coerceToString(body.client_id);
    const decision =
      OAuthUtils.coerceToString(body.decision) ?? OAuthUtils.coerceToString(body.action);
    const userId = OAuthUtils.coerceToString(body.user_id) ?? OAuthUtils.getCurrentUserId(c);
    const state = OAuthUtils.coerceToString(body.state);
    const codeChallenge = OAuthUtils.coerceToString(body.code_challenge);
    const codeChallengeMethod = OAuthUtils.coerceToString(body.code_challenge_method);
    const redirectUriRaw = OAuthUtils.coerceToString(body.redirect_uri);

    if (!clientId || !decision || !userId) {
      const errorBody = {
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id, decision, user_id',
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
      return wantsJsonResponse ? c.json(errorBody, 400) : c.text('Invalid consent decision', 400);
    }

    const client = await storage.getClient(clientId);
    if (!client) {
      const errorBody = {
        error: 'invalid_client',
        error_description: 'Unknown client',
      } as const;
      return wantsJsonResponse ? c.json(errorBody, 400) : c.text('Unknown client', 400);
    }

    const requestedScopesInput = OAuthUtils.normalizeScopeInput(body.scopes);
    const fallbackScopes = OAuthUtils.normalizeScopeInput(body.scope);
    const requestedScopes = requestedScopesInput.length > 0 ? requestedScopesInput : fallbackScopes;

    const validRequestedScopes = Array.from(
      new Set(requestedScopes.filter((scope) => oauthConfig.supportedScopes.includes(scope))),
    );

    const approvedScopeInput = OAuthUtils.normalizeScopeInput(body.approved_scopes);
    const approvedScopes =
      approvedScopeInput.length > 0 ? approvedScopeInput : validRequestedScopes;
    const supportedApprovedScopes = approvedScopes.filter((scope) =>
      oauthConfig.supportedScopes.includes(scope),
    );
    const filteredApprovedScopes =
      validRequestedScopes.length > 0
        ? supportedApprovedScopes.filter((scope) => validRequestedScopes.includes(scope))
        : supportedApprovedScopes;
    const uniqueApprovedScopes = Array.from(new Set(filteredApprovedScopes));

    const rememberDecision = OAuthUtils.parseBooleanFlag(body.remember_decision);
    const ttlSecondsRaw = OAuthUtils.coerceToNumber(body.ttl_seconds);
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

    let redirectUri: string | undefined;
    if (redirectUriRaw) {
      if (!OAuthUtils.validateRedirectUri(client, redirectUriRaw)) {
        const errorBody = {
          error: 'invalid_request',
          error_description: 'redirect_uri is not registered for this client',
        } as const;
        return wantsJsonResponse ? c.json(errorBody, 400) : c.text('Invalid redirect_uri', 400);
      }
      redirectUri = redirectUriRaw;
    } else if (client.redirect_uris.length > 0) {
      [redirectUri] = client.redirect_uris;
    }

    if (decision === 'approve') {
      if (validRequestedScopes.length > 0 && uniqueApprovedScopes.length === 0) {
        const errorBody = {
          error: 'invalid_request',
          error_description: 'Approved scopes must be a subset of the requested scopes',
        } as const;
        return wantsJsonResponse ? c.json(errorBody, 400) : c.text('No valid scopes approved', 400);
      }

      if (uniqueApprovedScopes.length > 0) {
        await consentService.recordUserConsent(userId, clientId, uniqueApprovedScopes, {
          remember: rememberDecision,
          ttlSeconds,
        });
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
        authorizeParams.set('scope', OAuthUtils.formatScopes(uniqueApprovedScopes));
      } else if (validRequestedScopes.length > 0) {
        authorizeParams.set('scope', OAuthUtils.formatScopes(validRequestedScopes));
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
      errorRedirect.searchParams.set('error_description', 'The resource owner denied the request');
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
};
