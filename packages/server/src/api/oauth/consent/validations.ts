import type { Context } from 'hono';
import { OAuthUtils } from '@mcp-funnel/auth';
import type { IOAuthProviderStorage, ClientRegistration } from '@mcp-funnel/models';

/**
 * Responds with an error message in either JSON or plain text format
 *
 * @param c - Hono context object for the current request
 * @param wantsJson - Whether the client prefers JSON response format
 * @param error - OAuth error code (e.g., 'invalid_request', 'invalid_client')
 * @param description - Human-readable error description
 * @returns Hono response with 400 status code in JSON or plain text format
 */
export function respondWithError(
  c: Context,
  wantsJson: boolean,
  error: string,
  description: string,
) {
  const err = { error, error_description: description };
  return wantsJson ? c.json(err, 400) : c.text(description, 400);
}

/**
 * Validates that all required parameters are present in the consent request
 *
 * @param params - Parsed consent request parameters to validate
 * @param c - Hono context object for the current request
 * @param wantsJson - Whether the client prefers JSON response format
 * @returns Error response if validation fails, null if valid
 */
export function validateRequiredParams(
  params: { clientId: string; decision: string; userId: string },
  c: Context,
  wantsJson: boolean,
) {
  if (!params.clientId || !params.decision || !params.userId) {
    return respondWithError(
      c,
      wantsJson,
      'invalid_request',
      'Missing required parameters: client_id, decision, user_id',
    );
  }
  return null;
}

/**
 * Validates that the decision is either "approve" or "deny"
 *
 * @param decision - User's consent decision
 * @param c - Hono context object for the current request
 * @param wantsJson - Whether the client prefers JSON response format
 * @returns Error response if validation fails, null if valid
 */
export function validateDecision(decision: string, c: Context, wantsJson: boolean) {
  if (decision !== 'approve' && decision !== 'deny') {
    return respondWithError(
      c,
      wantsJson,
      'invalid_request',
      'Decision must be either "approve" or "deny"',
    );
  }
  return null;
}

/**
 * Retrieves and validates that the OAuth client exists
 *
 * @param clientId - OAuth client identifier to validate
 * @param storage - Storage service for client lookup
 * @param c - Hono context object for the current request
 * @param wantsJson - Whether the client prefers JSON response format
 * @returns Tuple of [client, error] - one will be null
 */
export async function validateClient(
  clientId: string,
  storage: IOAuthProviderStorage,
  c: Context,
  wantsJson: boolean,
) {
  const client = await storage.getClient(clientId);
  if (!client) {
    return [null, respondWithError(c, wantsJson, 'invalid_client', 'Unknown client')] as const;
  }
  return [client, null] as const;
}

/**
 * Validates that the TTL value is non-negative
 *
 * @param ttlSecondsRaw - Raw TTL value from request
 * @param c - Hono context object for the current request
 * @param wantsJson - Whether the client prefers JSON response format
 * @returns Error response if validation fails, null if valid
 */
export function validateTtl(ttlSecondsRaw: number | undefined, c: Context, wantsJson: boolean) {
  if (ttlSecondsRaw !== undefined && ttlSecondsRaw < 0) {
    return respondWithError(
      c,
      wantsJson,
      'invalid_request',
      'ttl_seconds must be a non-negative number',
    );
  }
  return null;
}

/**
 * Validates and determines the redirect URI to use
 *
 * @param redirectUriRaw - Raw redirect URI from request
 * @param client - OAuth client with registered redirect URIs
 * @param c - Hono context object for the current request
 * @param wantsJson - Whether the client prefers JSON response format
 * @returns Tuple of [redirectUri, error] - error will be null if valid
 */
export function validateAndDetermineRedirectUri(
  redirectUriRaw: string | undefined,
  client: ClientRegistration,
  c: Context,
  wantsJson: boolean,
) {
  if (redirectUriRaw) {
    if (!OAuthUtils.validateRedirectUri(client, redirectUriRaw)) {
      return [
        undefined,
        respondWithError(
          c,
          wantsJson,
          'invalid_request',
          'redirect_uri is not registered for this client',
        ),
      ] as const;
    }
    return [redirectUriRaw, null] as const;
  }

  const redirectUri = client.redirect_uris.length > 0 ? client.redirect_uris[0] : undefined;
  return [redirectUri, null] as const;
}

/**
 * Validates that approved scopes are a subset of requested scopes
 *
 * @param requestedScopes - Scopes requested by the client
 * @param approvedScopes - Scopes approved by the user
 * @param c - Hono context object for the current request
 * @param wantsJson - Whether the client prefers JSON response format
 * @returns Error response if validation fails, null if valid
 */
export function validateApprovedScopes(
  requestedScopes: string[],
  approvedScopes: string[],
  c: Context,
  wantsJson: boolean,
) {
  if (requestedScopes.length > 0 && approvedScopes.length === 0) {
    return respondWithError(
      c,
      wantsJson,
      'invalid_request',
      'Approved scopes must be a subset of the requested scopes',
    );
  }
  return null;
}
