import { describe, it, expect, beforeEach } from 'vitest';
import { OauthTestUtils, type OAuthTestContext } from './test-utils.js';

describe('OAuthProvider - Token Revocation', () => {
  let context: OAuthTestContext;
  let accessToken: string;
  let refreshToken: string;
  let clientId: string;
  let clientSecret: string;

  beforeEach(async () => {
    context = OauthTestUtils.createOAuthProvider();
    const { oauthProvider, consentService } = context;

    const testClient = await oauthProvider.registerClient({
      client_name: 'Test Client',
      redirect_uris: ['http://localhost:8080/callback'],
    });

    clientId = testClient.client_id;
    clientSecret = testClient.client_secret!;

    await consentService.recordUserConsent('user123', clientId, ['read']);

    const authResult = await oauthProvider.handleAuthorizationRequest(
      {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'http://localhost:8080/callback',
        scope: 'read',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
      },
      'user123',
    );

    const tokenResult = await oauthProvider.handleTokenRequest({
      grant_type: 'authorization_code',
      code: authResult.authorizationCode!,
      redirect_uri: 'http://localhost:8080/callback',
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    });

    accessToken = tokenResult.tokenResponse!.access_token;
    refreshToken = tokenResult.tokenResponse!.refresh_token!;
  });

  it('revokes an access token', async () => {
    const { oauthProvider } = context;

    const result = await oauthProvider.revokeToken(accessToken, clientId);
    expect(result.success).toBe(true);

    const verifyResult = await oauthProvider.verifyAccessToken(accessToken);
    expect(verifyResult.valid).toBe(false);
  });

  it('revokes a refresh token', async () => {
    const { oauthProvider } = context;

    const result = await oauthProvider.revokeToken(refreshToken, clientId);
    expect(result.success).toBe(true);

    const tokenResult = await oauthProvider.handleTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    expect(tokenResult.success).toBe(false);
  });

  it('rejects revocation with the wrong client', async () => {
    const { oauthProvider } = context;

    const otherClient = await oauthProvider.registerClient({
      client_name: 'Other Client',
      redirect_uris: ['http://localhost:8080/callback'],
    });

    const result = await oauthProvider.revokeToken(accessToken, otherClient.client_id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Token not owned by client');
  });

  it('handles revocation of a non-existent token', async () => {
    const { oauthProvider } = context;

    const result = await oauthProvider.revokeToken('non-existent-token', clientId);
    expect(result.success).toBe(true);
  });
});
