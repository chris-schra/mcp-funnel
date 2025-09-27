/**
 * OAuth token management handlers
 */

import type { OAuthProvider } from '../../oauth/oauth-provider.js';
import type { Context } from 'hono';
import { OAuthErrorCodes } from '../../types/oauth-provider.js';
import {
  createOAuthErrorResponse,
  createTokenResponse,
} from '../../oauth/utils/oauth-utils.js';

/**
 * Handle OAuth 2.0 Token endpoint (RFC 6749)
 * POST /token
 */
export async function handleTokenRequest(
  c: Context,
  oauthProvider: OAuthProvider,
) {
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
}

/**
 * Handle OAuth 2.0 Token Revocation endpoint (RFC 7009)
 * POST /revoke
 */
export async function handleTokenRevocation(
  c: Context,
  oauthProvider: OAuthProvider,
) {
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
}

/**
 * Handle client registration endpoint (RFC 7591)
 * POST /register
 */
export async function handleClientRegistration(
  c: Context,
  oauthProvider: OAuthProvider,
) {
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
}

/**
 * Handle client secret rotation endpoint
 * POST /clients/:clientId/rotate-secret
 */
export async function handleClientSecretRotation(
  c: Context,
  oauthProvider: OAuthProvider,
) {
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
}
