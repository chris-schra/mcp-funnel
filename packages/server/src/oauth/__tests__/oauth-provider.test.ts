/**
 * Comprehensive tests for OAuth 2.0 Provider implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OAuthProvider } from '../oauth-provider.js';
import { MemoryOAuthStorage } from '../storage/memory-oauth-storage.js';
import { MemoryUserConsentService } from '../services/memory-consent-service.js';
import type {
  OAuthProviderConfig,
  ClientRegistration,
} from '../../types/oauth-provider.js';
import { OAuthErrorCodes } from '../../types/oauth-provider.js';

describe('OAuthProvider', () => {
  let oauthProvider: OAuthProvider;
  let storage: MemoryOAuthStorage;
  let consentService: MemoryUserConsentService;
  let config: OAuthProviderConfig;

  beforeEach(async () => {
    storage = new MemoryOAuthStorage();
    consentService = new MemoryUserConsentService();
    config = {
      issuer: 'http://localhost:3000',
      baseUrl: 'http://localhost:3000/api/oauth',
      defaultTokenExpiry: 3600,
      defaultCodeExpiry: 600,
      supportedScopes: ['read', 'write', 'admin'],
      requirePkce: true,
      issueRefreshTokens: true,
    };
    oauthProvider = new OAuthProvider(storage, consentService, config);
  });

  describe('Client Registration', () => {
    it('should register a new client successfully', async () => {
      const clientMetadata = {
        client_name: 'Test Client',
        redirect_uris: ['http://localhost:8080/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        scope: 'read write',
      };

      const client = await oauthProvider.registerClient(clientMetadata);

      expect(client.client_id).toBeDefined();
      expect(client.client_secret).toBeDefined();
      expect(client.client_name).toBe('Test Client');
      expect(client.redirect_uris).toEqual(['http://localhost:8080/callback']);
      expect(client.grant_types).toEqual(['authorization_code']);
      expect(client.response_types).toEqual(['code']);
      expect(client.scope).toBe('read write');
      expect(client.client_id_issued_at).toBeDefined();
      expect(client.client_secret_expires_at).toBeGreaterThan(
        Math.floor(Date.now() / 1000),
      );
    });

    it('should create client with default values when optional fields omitted', async () => {
      const clientMetadata = {
        redirect_uris: ['http://localhost:8080/callback'],
      };

      const client = await oauthProvider.registerClient(clientMetadata);

      expect(client.grant_types).toEqual(['authorization_code']);
      expect(client.response_types).toEqual(['code']);
      expect(client.client_name).toBeUndefined();
      expect(client.scope).toBeUndefined();
    });

    it('should set client secret expiry to 1 year by default', async () => {
      const clientMetadata = {
        client_name: 'Test Client',
        redirect_uris: ['http://localhost:8080/callback'],
      };

      const client = await oauthProvider.registerClient(clientMetadata);
      const currentTime = Math.floor(Date.now() / 1000);
      const oneYearFromNow = currentTime + 31536000; // 1 year in seconds

      expect(client.client_secret_expires_at).toBeGreaterThan(currentTime);
      expect(client.client_secret_expires_at).toBeLessThan(oneYearFromNow + 60); // Allow 60 second margin
      expect(client.client_secret_expires_at).toBeGreaterThan(
        oneYearFromNow - 60,
      ); // Allow 60 second margin
    });
  });

  describe('Authorization Request', () => {
    let testClient: ClientRegistration;

    beforeEach(async () => {
      testClient = await oauthProvider.registerClient({
        client_name: 'Test Client',
        redirect_uris: ['http://localhost:8080/callback'],
      });
    });

    it('should handle valid authorization request successfully', async () => {
      const userId = 'user123';
      const scopes = ['read'];

      // Record user consent first
      await consentService.recordUserConsent(
        userId,
        testClient.client_id,
        scopes,
      );

      const params = {
        response_type: 'code',
        client_id: testClient.client_id,
        redirect_uri: 'http://localhost:8080/callback',
        scope: 'read',
        state: 'random-state-123',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
      };

      const result = await oauthProvider.handleAuthorizationRequest(
        params,
        userId,
      );

      expect(result.success).toBe(true);
      expect(result.authorizationCode).toBeDefined();
      expect(result.redirectUri).toBe('http://localhost:8080/callback');
      expect(result.state).toBe('random-state-123');
      expect(result.error).toBeUndefined();
    });

    it('should reject request with missing response_type', async () => {
      const params = {
        client_id: testClient.client_id,
        redirect_uri: 'http://localhost:8080/callback',
      };

      const result = await oauthProvider.handleAuthorizationRequest(
        params,
        'user123',
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('response_type');
    });

    it('should reject request with unsupported response_type', async () => {
      const params = {
        response_type: 'token',
        client_id: testClient.client_id,
        redirect_uri: 'http://localhost:8080/callback',
      };

      const result = await oauthProvider.handleAuthorizationRequest(
        params,
        'user123',
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe(
        OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE,
      );
    });

    it('should reject request with invalid client_id', async () => {
      const params = {
        response_type: 'code',
        client_id: 'invalid-client-id',
        redirect_uri: 'http://localhost:8080/callback',
      };

      const result = await oauthProvider.handleAuthorizationRequest(
        params,
        'user123',
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_CLIENT);
    });

    it('should reject request with invalid redirect_uri', async () => {
      const params = {
        response_type: 'code',
        client_id: testClient.client_id,
        redirect_uri: 'http://evil.com/callback',
      };

      const result = await oauthProvider.handleAuthorizationRequest(
        params,
        'user123',
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('redirect_uri');
    });

    it('should reject request with invalid scope', async () => {
      const params = {
        response_type: 'code',
        client_id: testClient.client_id,
        redirect_uri: 'http://localhost:8080/callback',
        scope: 'invalid-scope',
      };

      const result = await oauthProvider.handleAuthorizationRequest(
        params,
        'user123',
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_SCOPE);
    });

    it('should require PKCE for public clients when configured', async () => {
      // Create public client
      const publicClient = await oauthProvider.registerClient({
        client_name: 'Public Client',
        redirect_uris: ['http://localhost:8080/callback'],
      });

      // Remove client secret to make it public
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

      const result = await oauthProvider.handleAuthorizationRequest(
        params,
        'user123',
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('PKCE');
    });

    it('should return consent_required error when user has not consented', async () => {
      const params = {
        response_type: 'code',
        client_id: testClient.client_id,
        redirect_uri: 'http://localhost:8080/callback',
        scope: 'read write',
        state: 'test-state-456',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
      };

      // Clear any existing consent to ensure no consent exists
      await consentService.clear();

      const result = await oauthProvider.handleAuthorizationRequest(
        params,
        'new-user-789',
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.CONSENT_REQUIRED);
      expect(result.error?.error_description).toBe(
        'User consent is required for the requested scopes',
      );
      expect(result.error?.consent_uri).toBe(
        `/api/oauth/consent?client_id=${encodeURIComponent(testClient.client_id)}&scope=${encodeURIComponent('read write')}&state=test-state-456`,
      );
    });

    it('should succeed when user has already consented to the scopes', async () => {
      const userId = 'consented-user-123';
      const scopes = ['read'];

      // Record user consent first
      await consentService.recordUserConsent(
        userId,
        testClient.client_id,
        scopes,
      );

      const params = {
        response_type: 'code',
        client_id: testClient.client_id,
        redirect_uri: 'http://localhost:8080/callback',
        scope: 'read',
        state: 'test-state-789',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
      };

      const result = await oauthProvider.handleAuthorizationRequest(
        params,
        userId,
      );

      expect(result.success).toBe(true);
      expect(result.authorizationCode).toBeDefined();
      expect(result.redirectUri).toBe('http://localhost:8080/callback');
      expect(result.state).toBe('test-state-789');
      expect(result.error).toBeUndefined();
    });
  });

  describe('Token Request - Authorization Code Grant', () => {
    let testClient: ClientRegistration;
    let authCode: string;

    beforeEach(async () => {
      testClient = await oauthProvider.registerClient({
        client_name: 'Test Client',
        redirect_uris: ['http://localhost:8080/callback'],
      });

      // Record user consent first
      await consentService.recordUserConsent('user123', testClient.client_id, [
        'read',
        'write',
      ]);

      // Create authorization code
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

    it('should exchange authorization code for tokens successfully', async () => {
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

    it('should set refresh token expiry to 30 days by default', async () => {
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
      expect(result.tokenResponse?.refresh_token).toBeDefined();

      // Get the refresh token from storage to check its expiry
      const refreshTokenData = await storage.getRefreshToken(
        result.tokenResponse!.refresh_token!,
      );
      expect(refreshTokenData).toBeDefined();

      const currentTime = Math.floor(Date.now() / 1000);
      const thirtyDaysFromNow = currentTime + 2592000; // 30 days in seconds

      expect(refreshTokenData!.expires_at).toBeGreaterThan(currentTime);
      expect(refreshTokenData!.expires_at).toBeLessThan(thirtyDaysFromNow + 60); // Allow 60 second margin
      expect(refreshTokenData!.expires_at).toBeGreaterThan(
        thirtyDaysFromNow - 60,
      ); // Allow 60 second margin
    });

    it('should reject request with invalid authorization code', async () => {
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

    it('should reject request with wrong client credentials', async () => {
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

    it('should reject request with wrong redirect_uri', async () => {
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

    it('should validate PKCE code verifier', async () => {
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

    it('should delete authorization code after use', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'http://localhost:8080/callback',
        client_id: testClient.client_id,
        client_secret: testClient.client_secret,
        code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      };

      // First request should succeed
      const result1 = await oauthProvider.handleTokenRequest(params);
      expect(result1.success).toBe(true);

      // Second request with same code should fail
      const result2 = await oauthProvider.handleTokenRequest(params);
      expect(result2.success).toBe(false);
      expect(result2.error?.error).toBe(OAuthErrorCodes.INVALID_GRANT);
    });
  });

  describe('Token Request - Refresh Token Grant', () => {
    let testClient: ClientRegistration;
    let refreshToken: string;

    beforeEach(async () => {
      testClient = await oauthProvider.registerClient({
        client_name: 'Test Client',
        redirect_uris: ['http://localhost:8080/callback'],
      });

      // Record user consent first
      await consentService.recordUserConsent('user123', testClient.client_id, [
        'read',
        'write',
      ]);

      // Get tokens first
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

    it('should refresh access token successfully', async () => {
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

    it('should allow scope reduction on refresh', async () => {
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

    it('should reject scope expansion on refresh', async () => {
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

    it('should reject invalid refresh token', async () => {
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
  });

  describe('Token Verification', () => {
    let testClient: ClientRegistration;
    let accessToken: string;

    beforeEach(async () => {
      testClient = await oauthProvider.registerClient({
        client_name: 'Test Client',
        redirect_uris: ['http://localhost:8080/callback'],
      });

      // Record user consent first
      await consentService.recordUserConsent('user123', testClient.client_id, [
        'read',
      ]);

      // Get access token
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

    it('should verify valid access token', async () => {
      const result = await oauthProvider.verifyAccessToken(accessToken);

      expect(result.valid).toBe(true);
      expect(result.tokenData?.client_id).toBe(testClient.client_id);
      expect(result.tokenData?.user_id).toBe('user123');
      expect(result.tokenData?.scopes).toEqual(['read']);
      expect(result.tokenData?.token_type).toBe('Bearer');
    });

    it('should reject invalid access token', async () => {
      const result = await oauthProvider.verifyAccessToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token not found');
    });
  });

  describe('Token Revocation', () => {
    let testClient: ClientRegistration;
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      testClient = await oauthProvider.registerClient({
        client_name: 'Test Client',
        redirect_uris: ['http://localhost:8080/callback'],
      });

      // Record user consent first
      await consentService.recordUserConsent('user123', testClient.client_id, [
        'read',
      ]);

      // Get tokens
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
      refreshToken = tokenResult.tokenResponse!.refresh_token!;
    });

    it('should revoke access token successfully', async () => {
      const result = await oauthProvider.revokeToken(
        accessToken,
        testClient.client_id,
      );
      expect(result.success).toBe(true);

      // Token should no longer be valid
      const verifyResult = await oauthProvider.verifyAccessToken(accessToken);
      expect(verifyResult.valid).toBe(false);
    });

    it('should revoke refresh token successfully', async () => {
      const result = await oauthProvider.revokeToken(
        refreshToken,
        testClient.client_id,
      );
      expect(result.success).toBe(true);

      // Should not be able to use refresh token
      const tokenResult = await oauthProvider.handleTokenRequest({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: testClient.client_id,
        client_secret: testClient.client_secret,
      });
      expect(tokenResult.success).toBe(false);
    });

    it('should reject revocation with wrong client', async () => {
      const otherClient = await oauthProvider.registerClient({
        client_name: 'Other Client',
        redirect_uris: ['http://localhost:8080/callback'],
      });

      const result = await oauthProvider.revokeToken(
        accessToken,
        otherClient.client_id,
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token not owned by client');
    });

    it('should handle revocation of non-existent token gracefully', async () => {
      const result = await oauthProvider.revokeToken(
        'non-existent-token',
        testClient.client_id,
      );
      expect(result.success).toBe(true); // Per RFC 7009
    });
  });

  describe('OAuth Metadata', () => {
    it('should return correct metadata', () => {
      const metadata = oauthProvider.getMetadata();

      expect(metadata.issuer).toBe('http://localhost:3000');
      expect(metadata.authorization_endpoint).toBe(
        'http://localhost:3000/api/oauth/authorize',
      );
      expect(metadata.token_endpoint).toBe(
        'http://localhost:3000/api/oauth/token',
      );
      expect(metadata.revocation_endpoint).toBe(
        'http://localhost:3000/api/oauth/revoke',
      );
      expect(metadata.scopes_supported).toEqual(['read', 'write', 'admin']);
      expect(metadata.response_types_supported).toEqual(['code']);
      expect(metadata.grant_types_supported).toEqual([
        'authorization_code',
        'refresh_token',
      ]);
      expect(metadata.token_endpoint_auth_methods_supported).toEqual([
        'client_secret_post',
        'none',
      ]);
      expect(metadata.code_challenge_methods_supported).toEqual([
        'plain',
        'S256',
      ]);
    });
  });
});
