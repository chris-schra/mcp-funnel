import { Hono } from 'hono';
import type { MCPProxy } from 'mcp-funnel';

type Variables = {
  mcpProxy: MCPProxy;
};

export const oauthRoute = new Hono<{ Variables: Variables }>();

/**
 * OAuth2 Authorization Code callback route
 * Handles authorization code callback from OAuth providers
 * Integrates with existing MCPProxy OAuth flow completion
 */
oauthRoute.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  // Handle OAuth error responses
  if (error) {
    const errorMsg = errorDescription || error;
    console.error(`OAuth authorization failed: ${errorMsg}`);

    return c.html(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Authorization Failed</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px; margin: 100px auto; padding: 20px;
            text-align: center; color: #333;
          }
          .error { color: #d32f2f; background: #ffebee; padding: 16px; border-radius: 4px; margin: 20px 0; }
          .code { font-family: 'Monaco', 'Menlo', monospace; background: #f5f5f5; padding: 4px 8px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h1>❌ Authorization Failed</h1>
        <div class="error">
          <strong>Error:</strong> <span class="code">${error}</span><br>
          ${errorDescription ? `<strong>Description:</strong> ${errorDescription}` : ''}
        </div>
        <p>You can close this window and try again.</p>
      </body>
      </html>
    `,
      400,
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return c.html(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invalid Request</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px; margin: 100px auto; padding: 20px;
            text-align: center; color: #333;
          }
          .error { color: #d32f2f; background: #ffebee; padding: 16px; border-radius: 4px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>❌ Invalid Request</h1>
        <div class="error">
          Missing required parameters: code or state
        </div>
        <p>You can close this window and try again.</p>
      </body>
      </html>
    `,
      400,
    );
  }

  try {
    const mcpProxy = c.get('mcpProxy');

    // Complete OAuth flow through MCPProxy
    await mcpProxy.completeOAuthFlow(state, code);

    // Return success page
    return c.html(`
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
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return c.html(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Authentication Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px; margin: 100px auto; padding: 20px;
            text-align: center; color: #333;
          }
          .error { color: #d32f2f; background: #ffebee; padding: 16px; border-radius: 4px; margin: 20px 0; }
          .details { font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; background: #f5f5f5; padding: 12px; border-radius: 4px; margin: 20px 0; text-align: left; }
        </style>
      </head>
      <body>
        <h1>❌ Authentication Error</h1>
        <div class="error">
          An error occurred while completing the authorization process.
        </div>
        <div class="details">${errorMessage}</div>
        <p>You can close this window and try again.</p>
      </body>
      </html>
    `,
      500,
    );
  }
});
