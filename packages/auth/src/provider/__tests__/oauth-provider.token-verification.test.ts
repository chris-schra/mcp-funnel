import { describe, it, expect, beforeEach } from 'vitest';
import { OauthTestUtils, type OAuthTestContext } from './test-utils.js';

describe('OAuthProvider - Token Verification', () => {
  let context: OAuthTestContext;
  let accessToken: string;

  beforeEach(async () => {
    context = OauthTestUtils.createOAuthProvider();
    const { oauthProvider, consentService } = context;

    const testClient = await oauthProvider.registerClient({
      client_name: 'Test Client',
      redirect_uris: ['http://localhost:8080/callback'],
    });

    await consentService.recordUserConsent('user123', testClient.client_id, ['read']);

    const authResult = await oauthProvider.handleAuthorizationRequest(
      {
        response_type: 'code',
        client_id: testClient.client_id,
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
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    });

    accessToken = tokenResult.tokenResponse!.access_token;
  });

  it('verifies a valid access token', async () => {
    const { oauthProvider } = context;

    const result = await oauthProvider.verifyAccessToken(accessToken);

    expect(result.valid).toBe(true);
    expect(result.tokenData?.client_id).toBeDefined();
    expect(result.tokenData?.user_id).toBe('user123');
    expect(result.tokenData?.scopes).toEqual(['read']);
    expect(result.tokenData?.token_type).toBe('Bearer');
  });

  it('rejects an invalid access token', async () => {
    const { oauthProvider } = context;

    const result = await oauthProvider.verifyAccessToken('invalid-token');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token not found');
  });
});
