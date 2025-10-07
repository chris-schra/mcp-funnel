import { describe, it, expect, beforeEach } from 'vitest';

import { OauthTestUtils, type OAuthTestContext } from './test-utils.js';
import { type ClientRegistration, OAuthErrorCodes } from '@mcp-funnel/models';

describe('OAuthProvider - Authorization Request', () => {
  let context: OAuthTestContext;
  let testClient: ClientRegistration;

  beforeEach(async () => {
    context = OauthTestUtils.createOAuthProvider();
    const { oauthProvider } = context;
    testClient = await oauthProvider.registerClient({
      client_name: 'Test Client',
      redirect_uris: ['http://localhost:8080/callback'],
    });
  });

  it('handles a valid authorization request', async () => {
    const { oauthProvider, consentService } = context;
    const userId = 'user123';
    const scopes = ['read'];

    await consentService.recordUserConsent(userId, testClient.client_id, scopes);

    const params = {
      response_type: 'code',
      client_id: testClient.client_id,
      redirect_uri: 'http://localhost:8080/callback',
      scope: 'read',
      state: 'random-state-123',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };

    const result = await oauthProvider.handleAuthorizationRequest(params, userId);

    expect(result.success).toBe(true);
    expect(result.authorizationCode).toBeDefined();
    expect(result.redirectUri).toBe('http://localhost:8080/callback');
    expect(result.state).toBe('random-state-123');
    expect(result.error).toBeUndefined();
  });

  it('rejects a request with missing response_type', async () => {
    const { oauthProvider } = context;
    const params = {
      client_id: testClient.client_id,
      redirect_uri: 'http://localhost:8080/callback',
    };

    const result = await oauthProvider.handleAuthorizationRequest(params, 'user123');

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('response_type');
  });

  it('rejects unsupported response_type', async () => {
    const { oauthProvider } = context;
    const params = {
      response_type: 'token',
      client_id: testClient.client_id,
      redirect_uri: 'http://localhost:8080/callback',
    };

    const result = await oauthProvider.handleAuthorizationRequest(params, 'user123');

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE);
  });

  it('rejects invalid client_id', async () => {
    const { oauthProvider } = context;
    const params = {
      response_type: 'code',
      client_id: 'invalid-client-id',
      redirect_uri: 'http://localhost:8080/callback',
    };

    const result = await oauthProvider.handleAuthorizationRequest(params, 'user123');

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_CLIENT);
  });

  it('rejects invalid redirect_uri', async () => {
    const { oauthProvider } = context;
    const params = {
      response_type: 'code',
      client_id: testClient.client_id,
      redirect_uri: 'http://evil.com/callback',
    };

    const result = await oauthProvider.handleAuthorizationRequest(params, 'user123');

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('redirect_uri');
  });

  it('rejects invalid scope', async () => {
    const { oauthProvider } = context;
    const params = {
      response_type: 'code',
      client_id: testClient.client_id,
      redirect_uri: 'http://localhost:8080/callback',
      scope: 'invalid-scope',
    };

    const result = await oauthProvider.handleAuthorizationRequest(params, 'user123');

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_SCOPE);
  });

  it('requires PKCE for public clients when configured', async () => {
    const { oauthProvider, storage } = context;
    const publicClient = await oauthProvider.registerClient({
      client_name: 'Public Client',
      redirect_uris: ['http://localhost:8080/callback'],
    });

    await storage.saveClient({
      ...publicClient,
      client_secret: undefined,
    });

    const params = {
      response_type: 'code',
      client_id: publicClient.client_id,
      redirect_uri: 'http://localhost:8080/callback',
      scope: 'read',
    };

    const result = await oauthProvider.handleAuthorizationRequest(params, 'user123');

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('PKCE');
  });

  it('returns consent_required when the user has not consented', async () => {
    const { oauthProvider, consentService } = context;
    const params = {
      response_type: 'code',
      client_id: testClient.client_id,
      redirect_uri: 'http://localhost:8080/callback',
      scope: 'read write',
      state: 'test-state-456',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };

    await consentService.clear();

    const result = await oauthProvider.handleAuthorizationRequest(params, 'new-user-789');

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.CONSENT_REQUIRED);
    expect(result.error?.error_description).toBe(
      'User consent is required for the requested scopes',
    );
    expect(result.error?.consent_uri).toBeDefined();

    const consentUrl = new URL(result.error?.consent_uri ?? '', 'http://localhost');
    expect(consentUrl.pathname).toBe('/api/oauth/consent');
    expect(consentUrl.searchParams.get('client_id')).toBe(testClient.client_id);
    expect(consentUrl.searchParams.get('scope')).toBe('read write');
    expect(consentUrl.searchParams.get('state')).toBe('test-state-456');
    expect(consentUrl.searchParams.get('redirect_uri')).toBe('http://localhost:8080/callback');
    expect(consentUrl.searchParams.get('code_challenge')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
    expect(consentUrl.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('succeeds when the user has already consented', async () => {
    const { oauthProvider, consentService } = context;
    const userId = 'consented-user-123';
    const scopes = ['read'];

    await consentService.recordUserConsent(userId, testClient.client_id, scopes);

    const params = {
      response_type: 'code',
      client_id: testClient.client_id,
      redirect_uri: 'http://localhost:8080/callback',
      scope: 'read',
      state: 'test-state-789',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };

    const result = await oauthProvider.handleAuthorizationRequest(params, userId);

    expect(result.success).toBe(true);
    expect(result.authorizationCode).toBeDefined();
    expect(result.redirectUri).toBe('http://localhost:8080/callback');
    expect(result.state).toBe('test-state-789');
    expect(result.error).toBeUndefined();
  });
});
