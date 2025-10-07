import { Hono } from 'hono';
import type { OAuthEnv } from '../types.js';
import { OAuthUtils } from '@mcp-funnel/auth';
import { OAuthErrorCodes } from '@mcp-funnel/models';

const ClientRoute = new Hono<OAuthEnv>();

ClientRoute.post('/:clientId/rotate-secret', async (c) => {
  try {
    const oauthProvider = c.get('oauthProvider');
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

    const result = await oauthProvider.rotateClientSecret(clientId, currentSecret);

    if (!result.success) {
      const status = result.error?.error === OAuthErrorCodes.INVALID_CLIENT ? 401 : 400;
      const errorResponse = OAuthUtils.createOAuthErrorResponse(result.error!, status);
      return c.json(errorResponse.body, errorResponse.status as 400 | 401 | 403 | 500);
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
export default ClientRoute;
