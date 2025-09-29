/**
 * Tests for OAuth utility functions
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../utils/index.js';
import { type ClientRegistration, OAuthErrorCodes } from '@mcp-funnel/models';

const {
  generateSecureToken,
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken,
  generateClientId,
  generateClientSecret,
  validateAuthorizationRequest,
  validateTokenRequest,
  validateClientCredentials,
  validateRedirectUri,
  validatePkceChallenge,
  parseScopes,
  formatScopes,
  validateScopes,
  getCurrentTimestamp,
  isExpired,
  createOAuthErrorResponse,
  createTokenResponse,
} = OAuthUtils;

describe('OAuth Utils', () => {
  describe('Token Generation', () => {
    it('should generate secure tokens of correct length', () => {
      const token1 = generateSecureToken(16);
      const token2 = generateSecureToken(16);

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2); // Should be different
      expect(typeof token1).toBe('string');
      expect(typeof token2).toBe('string');
    });

    it('should generate authorization codes', () => {
      const code = generateAuthorizationCode();
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });

    it('should generate access tokens', () => {
      const token = generateAccessToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate refresh tokens', () => {
      const token = generateRefreshToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate client IDs', () => {
      const clientId = generateClientId();
      expect(clientId).toBeDefined();
      expect(typeof clientId).toBe('string');
      expect(clientId.length).toBeGreaterThan(0);
    });

    it('should generate client secrets', () => {
      const secret = generateClientSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(0);
    });
  });

  describe('Authorization Request Validation', () => {
    it('should validate valid authorization request', () => {
      const params = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:8080/callback',
        scope: 'read write',
        state: 'random-state',
        code_challenge: 'challenge',
        code_challenge_method: 'plain',
      };

      const result = validateAuthorizationRequest(params);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject request missing response_type', () => {
      const params = {
        client_id: 'test-client',
        redirect_uri: 'http://localhost:8080/callback',
      };

      const result = validateAuthorizationRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('response_type');
    });

    it('should reject request missing client_id', () => {
      const params = {
        response_type: 'code',
        redirect_uri: 'http://localhost:8080/callback',
      };

      const result = validateAuthorizationRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('client_id');
    });

    it('should reject request missing redirect_uri', () => {
      const params = {
        response_type: 'code',
        client_id: 'test-client',
      };

      const result = validateAuthorizationRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('redirect_uri');
    });

    it('should reject unsupported response_type', () => {
      const params = {
        response_type: 'token',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:8080/callback',
      };

      const result = validateAuthorizationRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(
        OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE,
      );
    });

    it('should reject invalid redirect_uri format', () => {
      const params = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'not-a-valid-uri',
      };

      const result = validateAuthorizationRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('redirect_uri');
    });

    it('should require code_challenge_method when code_challenge is present', () => {
      const params = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:8080/callback',
        code_challenge: 'challenge',
      };

      const result = validateAuthorizationRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain(
        'code_challenge_method',
      );
    });

    it('should reject invalid code_challenge_method', () => {
      const params = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:8080/callback',
        code_challenge: 'challenge',
        code_challenge_method: 'invalid',
      };

      const result = validateAuthorizationRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain(
        'code_challenge_method',
      );
    });
  });

  describe('Token Request Validation', () => {
    it('should validate valid authorization code grant', () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'auth-code',
        redirect_uri: 'http://localhost:8080/callback',
        client_id: 'test-client',
      };

      const result = validateTokenRequest(params);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate valid refresh token grant', () => {
      const params = {
        grant_type: 'refresh_token',
        refresh_token: 'refresh-token',
        client_id: 'test-client',
      };

      const result = validateTokenRequest(params);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject request missing grant_type', () => {
      const params = {
        code: 'auth-code',
        client_id: 'test-client',
      };

      const result = validateTokenRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('grant_type');
    });

    it('should reject authorization code grant missing code', () => {
      const params = {
        grant_type: 'authorization_code',
        redirect_uri: 'http://localhost:8080/callback',
        client_id: 'test-client',
      };

      const result = validateTokenRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('code');
    });

    it('should reject refresh token grant missing refresh_token', () => {
      const params = {
        grant_type: 'refresh_token',
        client_id: 'test-client',
      };

      const result = validateTokenRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
      expect(result.error?.error_description).toContain('refresh_token');
    });

    it('should reject unsupported grant type', () => {
      const params = {
        grant_type: 'client_credentials',
        client_id: 'test-client',
      };

      const result = validateTokenRequest(params);
      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe(OAuthErrorCodes.UNSUPPORTED_GRANT_TYPE);
    });
  });

  describe('Client Credentials Validation', () => {
    it('should validate public client without secret', () => {
      const client: ClientRegistration = {
        client_id: 'public-client',
        redirect_uris: ['http://localhost:8080/callback'],
      };

      const result = validateClientCredentials(client);
      expect(result).toBe(true);
    });

    it('should validate confidential client with correct secret', () => {
      const client: ClientRegistration = {
        client_id: 'confidential-client',
        client_secret: 'secret123',
        redirect_uris: ['http://localhost:8080/callback'],
      };

      const result = validateClientCredentials(client, 'secret123');
      expect(result).toBe(true);
    });

    it('should reject confidential client with wrong secret', () => {
      const client: ClientRegistration = {
        client_id: 'confidential-client',
        client_secret: 'secret123',
        redirect_uris: ['http://localhost:8080/callback'],
      };

      const result = validateClientCredentials(client, 'wrong-secret');
      expect(result).toBe(false);
    });

    it('should reject public client with provided secret', () => {
      const client: ClientRegistration = {
        client_id: 'public-client',
        redirect_uris: ['http://localhost:8080/callback'],
      };

      const result = validateClientCredentials(client, 'some-secret');
      expect(result).toBe(false);
    });
  });

  describe('Redirect URI Validation', () => {
    const client: ClientRegistration = {
      client_id: 'test-client',
      redirect_uris: [
        'http://localhost:8080/callback',
        'https://app.example.com/oauth/callback',
      ],
    };

    it('should validate registered redirect URI', () => {
      const result = validateRedirectUri(
        client,
        'http://localhost:8080/callback',
      );
      expect(result).toBe(true);
    });

    it('should reject unregistered redirect URI', () => {
      const result = validateRedirectUri(client, 'http://evil.com/callback');
      expect(result).toBe(false);
    });
  });

  describe('PKCE Validation', () => {
    it('should validate plain PKCE challenge', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = verifier;

      const result = validatePkceChallenge(verifier, challenge, 'plain');
      expect(result).toBe(true);
    });

    it('should validate S256 PKCE challenge', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const result = validatePkceChallenge(verifier, challenge, 'S256');
      expect(result).toBe(true);
    });

    it('should reject wrong plain PKCE verifier', () => {
      const verifier = 'wrong-verifier';
      const challenge = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

      const result = validatePkceChallenge(verifier, challenge, 'plain');
      expect(result).toBe(false);
    });

    it('should reject wrong S256 PKCE verifier', () => {
      const verifier = 'wrong-verifier';
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const result = validatePkceChallenge(verifier, challenge, 'S256');
      expect(result).toBe(false);
    });

    it('should reject unsupported PKCE method', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = verifier;

      const result = validatePkceChallenge(verifier, challenge, 'unsupported');
      expect(result).toBe(false);
    });
  });

  describe('Scope Utilities', () => {
    it('should parse space-separated scopes', () => {
      const result = parseScopes('read write admin');
      expect(result).toEqual(['read', 'write', 'admin']);
    });

    it('should handle empty scope string', () => {
      const result = parseScopes('');
      expect(result).toEqual([]);
    });

    it('should handle undefined scope', () => {
      const result = parseScopes(undefined);
      expect(result).toEqual([]);
    });

    it('should filter out empty scopes', () => {
      const result = parseScopes('read  write   admin');
      expect(result).toEqual(['read', 'write', 'admin']);
    });

    it('should format scopes to space-separated string', () => {
      const result = formatScopes(['read', 'write', 'admin']);
      expect(result).toBe('read write admin');
    });

    it('should validate scopes against supported list', () => {
      const supportedScopes = ['read', 'write', 'admin'];

      expect(validateScopes(['read'], supportedScopes)).toBe(true);
      expect(validateScopes(['read', 'write'], supportedScopes)).toBe(true);
      expect(validateScopes(['read', 'invalid'], supportedScopes)).toBe(false);
      expect(validateScopes(['invalid'], supportedScopes)).toBe(false);
    });
  });

  describe('Time Utilities', () => {
    it('should get current timestamp', () => {
      const timestamp = getCurrentTimestamp();
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);

      // Should be approximately current time (within 1 second)
      const now = Math.floor(Date.now() / 1000);
      expect(Math.abs(timestamp - now)).toBeLessThanOrEqual(1);
    });

    it('should detect expired timestamps', () => {
      const expiredTime = getCurrentTimestamp() - 100; // 100 seconds ago
      const futureTime = getCurrentTimestamp() + 100; // 100 seconds from now

      expect(isExpired(expiredTime)).toBe(true);
      expect(isExpired(futureTime)).toBe(false);
    });
  });

  describe('Response Utilities', () => {
    it('should create OAuth error response', () => {
      const error = {
        error: 'invalid_request',
        error_description: 'Missing parameter',
      };

      const response = createOAuthErrorResponse(error);

      expect(response.status).toBe(400);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.headers['Cache-Control']).toBe('no-store');
      expect(response.headers['Pragma']).toBe('no-cache');
      expect(response.body).toEqual(error);
    });

    it('should create OAuth error response with custom status', () => {
      const error = {
        error: 'server_error',
        error_description: 'Internal error',
      };

      const response = createOAuthErrorResponse(error, 500);

      expect(response.status).toBe(500);
      expect(response.body).toEqual(error);
    });

    it('should create token response', () => {
      const tokenData = {
        access_token: 'access-token-123',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      const response = createTokenResponse(tokenData);

      expect(response.status).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.headers['Cache-Control']).toBe('no-store');
      expect(response.headers['Pragma']).toBe('no-cache');
      expect(response.body).toEqual(tokenData);
    });
  });
});
