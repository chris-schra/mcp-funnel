import type { OAuthHandler } from './types.js';

export const RevokeTokenHandler: OAuthHandler = async (c) => {
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

    await c.get('oauthProvider').revokeToken(token, clientId);

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
};
