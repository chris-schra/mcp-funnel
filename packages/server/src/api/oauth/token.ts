import type { OAuthHandler } from './types.js';
import { OAuthUtils } from '@mcp-funnel/auth';

export const PostTokenHandler: OAuthHandler = async (c) => {
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

    const result = await c.get('oauthProvider').handleTokenRequest(params);

    if (!result.success) {
      const errorResponse = OAuthUtils.createOAuthErrorResponse(result.error!);
      return c.json(
        errorResponse.body,
        errorResponse.status as 400 | 401 | 403 | 500,
      );
    }

    const tokenResponse = OAuthUtils.createTokenResponse(
      result.tokenResponse! as unknown as Record<string, unknown>,
    );
    return c.json(tokenResponse.body, tokenResponse.status as 200);
  } catch (error) {
    console.error('Token endpoint error:', error);
    const errorResponse = OAuthUtils.createOAuthErrorResponse(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      500,
    );
    return c.json(errorResponse.body, errorResponse.status as 500);
  }
};
