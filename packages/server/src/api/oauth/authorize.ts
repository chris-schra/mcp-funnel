import { OAuthUtils } from '@mcp-funnel/auth';
import type { OAuthHandler } from './types.js';

export const AuthorizeHandler: OAuthHandler = async (c) => {
  try {
    // Get user ID (in production, ensure user is authenticated)
    const userId = OAuthUtils.getCurrentUserId(c);
    if (!userId) {
      // Redirect to login page
      return c.redirect('/login?redirect=' + encodeURIComponent(c.req.url));
    }

    const params = {
      response_type: c.req.query('response_type'),
      client_id: c.req.query('client_id'),
      redirect_uri: c.req.query('redirect_uri'),
      scope: c.req.query('scope'),
      state: c.req.query('state'),
      code_challenge: c.req.query('code_challenge'),
      code_challenge_method: c.req.query('code_challenge_method'),
    };

    const result = await c.get('oauthProvider').handleAuthorizationRequest(params, userId);

    if (!result.success) {
      // Build error redirect URI
      const redirectUri = new URL(params.redirect_uri || 'about:blank');
      redirectUri.searchParams.set('error', result.error!.error);
      if (result.error!.error_description) {
        redirectUri.searchParams.set('error_description', result.error!.error_description);
      }
      if (params.state) {
        redirectUri.searchParams.set('state', params.state);
      }
      return c.redirect(redirectUri.toString());
    }

    // Build success redirect URI
    const redirectUri = new URL(result.redirectUri!);
    redirectUri.searchParams.set('code', result.authorizationCode!);
    if (result.state) {
      redirectUri.searchParams.set('state', result.state);
    }

    return c.redirect(redirectUri.toString());
  } catch (error) {
    console.error('Authorization error:', error);
    const redirectUri = c.req.query('redirect_uri');
    if (redirectUri) {
      const errorRedirect = new URL(redirectUri);
      errorRedirect.searchParams.set('error', 'server_error');
      errorRedirect.searchParams.set('error_description', 'Internal server error');
      if (c.req.query('state')) {
        errorRedirect.searchParams.set('state', c.req.query('state')!);
      }
      return c.redirect(errorRedirect.toString());
    }
    return c.text('Internal server error', 500);
  }
};
