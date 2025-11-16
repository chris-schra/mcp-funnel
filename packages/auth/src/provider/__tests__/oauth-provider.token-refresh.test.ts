import { describe, it, expect, beforeEach } from 'vitest';
import { OAuthProvider } from '../oauth-provider.js';
import { OauthTestUtils, type OAuthTestContext } from './test-utils.js';
import { type ClientRegistration, OAuthErrorCodes } from '@mcp-funnel/models';

describe('OAuthProvider - Token Request (Refresh Token Grant)', () => {
  let context: OAuthTestContext;
  let testClient: ClientRegistration;
  let refreshToken: string;

  beforeEach(async () => {
    context = OauthTestUtils.createOAuthProvider();
    const { oauthProvider, consentService } = context;

    testClient = await oauthProvider.registerClient({
      client_name: 'Test Client',
      redirect_uris: ['http://localhost:8080/callback'],
    });

    await consentService.recordUserConsent('user123', testClient.client_id, ['read', 'write']);

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

    const tokenResult = await oauthProvider.handleTokenRequest({
      grant_type: 'authorization_code',
      code: authResult.authorizationCode!,
      redirect_uri: 'http://localhost:8080/callback',
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    });

    refreshToken = tokenResult.tokenResponse!.refresh_token!;
  });

  it('refreshes the access token successfully', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
    };

    const result = await oauthProvider.handleTokenRequest(params);

    expect(result.success).toBe(true);
    expect(result.tokenResponse?.access_token).toBeDefined();
    expect(result.tokenResponse?.token_type).toBe('Bearer');
    expect(result.tokenResponse?.expires_in).toBe(3600);
    expect(result.tokenResponse?.scope).toBe('read write');
  });

  it('allows scope reduction when refreshing', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
      scope: 'read',
    };

    const result = await oauthProvider.handleTokenRequest(params);

    expect(result.success).toBe(true);
    expect(result.tokenResponse?.scope).toBe('read');
  });

  it('rejects scope expansion when refreshing', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
      scope: 'read write admin',
    };

    const result = await oauthProvider.handleTokenRequest(params);

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_SCOPE);
  });

  it('rejects an invalid refresh token', async () => {
    const { oauthProvider } = context;
    const params = {
      grant_type: 'refresh_token',
      refresh_token: 'invalid-refresh-token',
      client_id: testClient.client_id,
      client_secret: testClient.client_secret,
    };

    const result = await oauthProvider.handleTokenRequest(params);

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_GRANT);
  });

  it('rotates the refresh token when rotation is required', async () => {
    const { storage, consentService, config } = context;
    let oauthProvider = context.oauthProvider;
    await storage.clear();
    await consentService.clear();

    config.requireTokenRotation = true;
    oauthProvider = new OAuthProvider(storage, consentService, config);
    context = { oauthProvider, storage, consentService, config };

    const rotatingClient = await oauthProvider.registerClient({
      client_name: 'Rotating Client',
      redirect_uris: ['http://localhost:8080/callback'],
    });

    await consentService.recordUserConsent('user123', rotatingClient.client_id, ['read', 'write']);

    const authResult = await oauthProvider.handleAuthorizationRequest(
      {
        response_type: 'code',
        client_id: rotatingClient.client_id,
        redirect_uri: 'http://localhost:8080/callback',
        scope: 'read write',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
      },
      'user123',
    );

    const initialTokenResult = await oauthProvider.handleTokenRequest({
      grant_type: 'authorization_code',
      code: authResult.authorizationCode!,
      redirect_uri: 'http://localhost:8080/callback',
      client_id: rotatingClient.client_id,
      client_secret: rotatingClient.client_secret,
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    });

    const originalRefreshToken = initialTokenResult.tokenResponse!.refresh_token!;

    const rotationResult = await oauthProvider.handleTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: originalRefreshToken,
      client_id: rotatingClient.client_id,
      client_secret: rotatingClient.client_secret,
    });

    expect(rotationResult.success).toBe(true);
    expect(rotationResult.tokenResponse?.refresh_token).toBeDefined();
    expect(rotationResult.tokenResponse?.refresh_token).not.toBe(originalRefreshToken);

    const storedOriginal = await storage.getRefreshToken(originalRefreshToken);
    expect(storedOriginal).toBeNull();

    const rotatedRefreshToken = rotationResult.tokenResponse!.refresh_token!;
    const storedRotated = await storage.getRefreshToken(rotatedRefreshToken);
    expect(storedRotated).toBeDefined();
    expect(storedRotated?.client_id).toBe(rotatingClient.client_id);
    expect(storedRotated?.user_id).toBe('user123');
    expect(storedRotated?.scopes).toEqual(['read', 'write']);

    const reuseResult = await oauthProvider.handleTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: originalRefreshToken,
      client_id: rotatingClient.client_id,
      client_secret: rotatingClient.client_secret,
    });

    expect(reuseResult.success).toBe(false);
    expect(reuseResult.error?.error).toBe(OAuthErrorCodes.INVALID_GRANT);
  });
});
