import { describe, it, expect, beforeEach } from 'vitest';
import { OauthTestUtils, type OAuthTestContext } from './test-utils.js';
import { ClientRegistration, OAuthErrorCodes } from '@mcp-funnel/models';

describe('OAuthProvider - Token Request (Authorization Code Grant)', () => {
  let context: OAuthTestContext;
  let testClient: ClientRegistration;
  let authCode: string;

  beforeEach(async () => {
    context = OauthTestUtils.createOAuthProvider();
    const { oauthProvider, consentService } = context;

    testClient = await oauthProvider.registerClient({
      client_name: 'Test Client',
      redirect_uris: ['http://localhost:8080/callback'],
    });

    await consentService.recordUserConsent('user123', testClient.client_id, [
      'read',
      'write',
    ]);

    const authResult = await oauthProvider.handleAuthorizationRequest(
      {
        response_type: 'code',
        client_id: testClient.client_id,
        redirect_uri: 'http://localhost:8080/callback',
        scope: 'read write',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
      },
      'user123',
    );

    authCode = authResult.authorizationCode!;
  });

  it('exchanges an authorization code for tokens', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: 'http://localhost:8080/callback',
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };

    const result = await oauthProvider.handleTokenRequest(params);

    expect(result.success).toBe(true);
    expect(result.tokenResponse?.access_token).toBeDefined();
    expect(result.tokenResponse?.token_type).toBe('Bearer');
    expect(result.tokenResponse?.expires_in).toBe(3600);
    expect(result.tokenResponse?.scope).toBe('read write');
    expect(result.tokenResponse?.refresh_token).toBeDefined();
  });

  it('sets refresh token expiry to 30 days by default', async () => {
    const { oauthProvider, storage } = context;
    const params = {
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: 'http://localhost:8080/callback',
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };

    const result = await oauthProvider.handleTokenRequest(params);
    expect(result.success).toBe(true);

    const refreshToken = result.tokenResponse!.refresh_token!;
    const refreshTokenData = await storage.getRefreshToken(refreshToken);
    expect(refreshTokenData).toBeDefined();

    const currentTime = Math.floor(Date.now() / 1000);
    const thirtyDaysFromNow = currentTime + 2_592_000; // 30 days in seconds

    expect(refreshTokenData!.expires_at).toBeGreaterThan(currentTime);
    expect(refreshTokenData!.expires_at).toBeLessThan(thirtyDaysFromNow + 60);
    expect(refreshTokenData!.expires_at).toBeGreaterThan(
      thirtyDaysFromNow - 60,
    );
  });

  it('rejects an invalid authorization code', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'authorization_code',
      code: 'invalid-code',
      redirect_uri: 'http://localhost:8080/callback',
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
    };

    const result = await oauthProvider.handleTokenRequest(params);

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_GRANT);
  });

  it('rejects wrong client credentials', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: 'http://localhost:8080/callback',
      client_id: testClient.client_id,
      client_secret: 'wrong-secret',
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };

    const result = await oauthProvider.handleTokenRequest(params);

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_CLIENT);
  });

  it('rejects mismatched redirect_uri', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: 'http://wrong.com/callback',
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };

    const result = await oauthProvider.handleTokenRequest(params);

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_GRANT);
    expect(result.error?.error_description).toContain('redirect_uri');
  });

  it('validates PKCE code verifier', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: 'http://localhost:8080/callback',
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
      code_verifier: 'wrong-verifier',
    };

    const result = await oauthProvider.handleTokenRequest(params);

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_GRANT);
    expect(result.error?.error_description).toContain('PKCE');
  });

  it('deletes the authorization code after use', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: 'http://localhost:8080/callback',
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };

    const firstResult = await oauthProvider.handleTokenRequest(params);
    expect(firstResult.success).toBe(true);

    const secondResult = await oauthProvider.handleTokenRequest(params);
    expect(secondResult.success).toBe(false);
    expect(secondResult.error?.error).toBe(OAuthErrorCodes.INVALID_GRANT);
  });
});
