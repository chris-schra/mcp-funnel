/**
 * OAuth authorization flow handlers
 */

import type { OAuthProvider } from '../../oauth/oauth-provider.js';
import type { Context } from 'hono';
import { getCurrentUserId } from './request-utils.js';

/**
 * Handle OAuth 2.0 Authorization endpoint (RFC 6749)
 * GET /authorize
 */
export async function handleAuthorizationRequest(
  c: Context,
  oauthProvider: OAuthProvider,
) {
  try {
    // Get user ID (in production, ensure user is authenticated)
    const userId = getCurrentUserId(c);
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

    const result = await oauthProvider.handleAuthorizationRequest(
      params,
      userId,
    );

    if (!result.success) {
      // Build error redirect URI
      const redirectUri = new URL(params.redirect_uri || 'about:blank');
      redirectUri.searchParams.set('error', result.error!.error);
      if (result.error!.error_description) {
        redirectUri.searchParams.set(
          'error_description',
          result.error!.error_description,
        );
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
      errorRedirect.searchParams.set(
        'error_description',
        'Internal server error',
      );
      if (c.req.query('state')) {
        errorRedirect.searchParams.set('state', c.req.query('state')!);
      }
      return c.redirect(errorRedirect.toString());
    }
    return c.text('Internal server error', 500);
  }
}

/**
 * Handle OAuth2 Authorization Code callback route
 * Handles authorization code callback from OAuth providers
 * Integrates with existing MCPProxy OAuth flow completion
 */
export async function handleAuthorizationCallback(c: Context) {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  // Handle OAuth error responses
  if (error) {
    const errorMsg = errorDescription || error;
    console.error(`OAuth authorization failed: ${errorMsg}`);

    return c.html(
      createErrorHtml(
        'Authorization Failed',
        'Error',
        error,
        errorDescription || undefined,
      ),
      400,
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return c.html(
      createErrorHtml(
        'Invalid Request',
        'Missing required parameters: code or state',
      ),
      400,
    );
  }

  try {
    const mcpProxy = c.get('mcpProxy');

    // Complete OAuth flow through MCPProxy
    await mcpProxy.completeOAuthFlow(state, code);

    // Return success page
    return c.html(createSuccessHtml());
  } catch (error) {
    console.error('OAuth callback error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return c.html(
      createErrorHtml(
        'Authentication Error',
        'An error occurred while completing the authorization process.',
        undefined,
        errorMessage,
      ),
      500,
    );
  }
}

/**
 * Create error HTML response
 */
function createErrorHtml(
  title: string,
  description: string,
  errorCode?: string,
  errorDetails?: string,
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          max-width: 600px; margin: 100px auto; padding: 20px;
          text-align: center; color: #333;
        }
        .error { color: #d32f2f; background: #ffebee; padding: 16px; border-radius: 4px; margin: 20px 0; }
        .code { font-family: 'Monaco', 'Menlo', monospace; background: #f5f5f5; padding: 4px 8px; border-radius: 3px; }
        .details { font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; background: #f5f5f5; padding: 12px; border-radius: 4px; margin: 20px 0; text-align: left; }
      </style>
    </head>
    <body>
      <h1>❌ ${title}</h1>
      <div class="error">
        ${description}
        ${
          errorCode
            ? `<br><strong>Error:</strong> <span class="code">${errorCode}</span>`
            : ''
        }
      </div>
      ${errorDetails ? `<div class="details">${errorDetails}</div>` : ''}
      <p>You can close this window and try again.</p>
    </body>
    </html>
  `;
}

/**
 * Create success HTML response
 */
function createSuccessHtml(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Authorization Successful</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          max-width: 600px; margin: 100px auto; padding: 20px;
          text-align: center; color: #333;
        }
        .success { color: #388e3c; background: #e8f5e8; padding: 16px; border-radius: 4px; margin: 20px 0; }
        .next-steps { text-align: left; background: #f5f5f5; padding: 16px; border-radius: 4px; margin: 20px 0; }
        .code { font-family: 'Monaco', 'Menlo', monospace; background: #ffffff; padding: 2px 4px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>✅ Authorization Successful!</h1>
      <div class="success">
        Your authorization has been completed successfully.
      </div>
      <div class="next-steps">
        <h3>Next Steps:</h3>
        <ol>
          <li>You can close this browser window</li>
          <li>Return to your terminal - the authentication process should continue automatically</li>
          <li>Your credentials are now configured and ready to use</li>
        </ol>
      </div>
      <p><strong>You can safely close this window.</strong></p>
      <script>
        // Auto-close after 3 seconds for better UX
        setTimeout(function() {
          window.close();
        }, 3000);
      </script>
    </body>
    </html>
  `;
}
