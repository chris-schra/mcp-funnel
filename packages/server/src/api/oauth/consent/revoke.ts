import { type Handler } from 'hono';
import { OAuthUtils } from '@mcp-funnel/auth';

export const PostConsentRevokeHandler: Handler = async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    const isJsonRequest = contentType.includes('application/json');
    const rawBody: unknown = isJsonRequest
      ? await c.req.json()
      : await c.req.parseBody();

    const body = (rawBody as Record<string, unknown>) ?? {};
    const clientId = OAuthUtils.coerceToString(body.client_id);
    const userId =
      OAuthUtils.coerceToString(body.user_id) ?? OAuthUtils.getCurrentUserId(c);

    if (!clientId || !userId) {
      return c.json(
        {
          error: 'invalid_request',
          error_description: 'Missing required parameters: client_id, user_id',
        },
        400,
      );
    }

    const client = await c.get('storage').getClient(clientId);
    if (!client) {
      return c.json(
        {
          error: 'invalid_client',
          error_description: 'Unknown client',
        },
        400,
      );
    }

    const scopesToRevoke = OAuthUtils.normalizeScopeInput(body.scopes);
    const fallbackScopes = OAuthUtils.normalizeScopeInput(body.scope);
    const combinedScopes = scopesToRevoke.length
      ? scopesToRevoke
      : fallbackScopes;
    const validScopes = combinedScopes.filter((scope) =>
      c.get('oauthConfig').supportedScopes.includes(scope),
    );

    await c
      .get('consentService')
      .revokeUserConsent(
        userId,
        clientId,
        validScopes.length > 0 ? validScopes : undefined,
      );

    return c.json({
      status: 'success',
      message: validScopes.length
        ? 'Consent scopes revoked successfully'
        : 'Consent revoked successfully',
      revoked_scopes: validScopes,
    });
  } catch (error) {
    console.error('Consent revocation error:', error);
    return c.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      500,
    );
  }
};
