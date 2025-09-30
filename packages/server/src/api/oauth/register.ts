import type { OAuthHandler } from './types.js';

export const RegisterHandler: OAuthHandler = async (c) => {
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

    const client = await c.get('oauthProvider').registerClient({
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
};
