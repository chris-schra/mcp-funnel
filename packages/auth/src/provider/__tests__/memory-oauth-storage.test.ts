/**
 * Tests for MemoryOAuthStorage implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryOAuthStorage } from '../storage/memory-oauth-storage.js';
import type {
  AccessToken,
  AuthorizationCode,
  ClientRegistration,
  RefreshToken,
} from '@mcp-funnel/models';

describe('MemoryOAuthStorage', () => {
  let storage: MemoryOAuthStorage;

  beforeEach(() => {
    storage = new MemoryOAuthStorage();
  });

  describe('Client Management', () => {
    const testClient: ClientRegistration = {
      client_id: 'test-client-123',
      client_secret: 'test-secret',
      client_name: 'Test Client',
      redirect_uris: ['http://localhost:8080/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope: 'read write',
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
    };

    it('should save and retrieve client', async () => {
      await storage.saveClient(testClient);
      const retrieved = await storage.getClient(testClient.client_id);

      expect(retrieved).toEqual(testClient);
    });

    it('should return null for non-existent client', async () => {
      const retrieved = await storage.getClient('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete client', async () => {
      await storage.saveClient(testClient);
      await storage.deleteClient(testClient.client_id);

      const retrieved = await storage.getClient(testClient.client_id);
      expect(retrieved).toBeNull();
    });

    it('should update existing client', async () => {
      await storage.saveClient(testClient);

      const updatedClient = { ...testClient, client_name: 'Updated Client' };
      await storage.saveClient(updatedClient);

      const retrieved = await storage.getClient(testClient.client_id);
      expect(retrieved?.client_name).toBe('Updated Client');
    });
  });

  describe('Authorization Code Management', () => {
    const testAuthCode: AuthorizationCode = {
      code: 'test-auth-code-123',
      client_id: 'test-client',
      user_id: 'test-user',
      redirect_uri: 'http://localhost:8080/callback',
      scopes: ['read'],
      expires_at: Math.floor(Date.now() / 1000) + 600,
      created_at: Math.floor(Date.now() / 1000),
    };

    it('should save and retrieve authorization code', async () => {
      await storage.saveAuthorizationCode(testAuthCode);
      const retrieved = await storage.getAuthorizationCode(testAuthCode.code);

      expect(retrieved).toEqual(testAuthCode);
    });

    it('should return null for non-existent authorization code', async () => {
      const retrieved = await storage.getAuthorizationCode('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete authorization code', async () => {
      await storage.saveAuthorizationCode(testAuthCode);
      await storage.deleteAuthorizationCode(testAuthCode.code);

      const retrieved = await storage.getAuthorizationCode(testAuthCode.code);
      expect(retrieved).toBeNull();
    });
  });

  describe('Access Token Management', () => {
    const testAccessToken: AccessToken = {
      token: 'test-access-token-123',
      client_id: 'test-client',
      user_id: 'test-user',
      scopes: ['read', 'write'],
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      created_at: Math.floor(Date.now() / 1000),
      token_type: 'Bearer',
    };

    it('should save and retrieve access token', async () => {
      await storage.saveAccessToken(testAccessToken);
      const retrieved = await storage.getAccessToken(testAccessToken.token);

      expect(retrieved).toEqual(testAccessToken);
    });

    it('should return null for non-existent access token', async () => {
      const retrieved = await storage.getAccessToken('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete access token', async () => {
      await storage.saveAccessToken(testAccessToken);
      await storage.deleteAccessToken(testAccessToken.token);

      const retrieved = await storage.getAccessToken(testAccessToken.token);
      expect(retrieved).toBeNull();
    });
  });

  describe('Refresh Token Management', () => {
    const testRefreshToken: RefreshToken = {
      token: 'test-refresh-token-123',
      client_id: 'test-client',
      user_id: 'test-user',
      scopes: ['read', 'write'],
      expires_at: 0, // Never expires
      created_at: Math.floor(Date.now() / 1000),
    };

    it('should save and retrieve refresh token', async () => {
      await storage.saveRefreshToken(testRefreshToken);
      const retrieved = await storage.getRefreshToken(testRefreshToken.token);

      expect(retrieved).toEqual(testRefreshToken);
    });

    it('should return null for non-existent refresh token', async () => {
      const retrieved = await storage.getRefreshToken('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete refresh token', async () => {
      await storage.saveRefreshToken(testRefreshToken);
      await storage.deleteRefreshToken(testRefreshToken.token);

      const retrieved = await storage.getRefreshToken(testRefreshToken.token);
      expect(retrieved).toBeNull();
    });
  });

  describe('Cleanup Expired Tokens', () => {
    it('should clean up expired authorization codes', async () => {
      const expiredCode: AuthorizationCode = {
        code: 'expired-code',
        client_id: 'test-client',
        user_id: 'test-user',
        redirect_uri: 'http://localhost:8080/callback',
        scopes: ['read'],
        expires_at: Math.floor(Date.now() / 1000) - 100, // Expired
        created_at: Math.floor(Date.now() / 1000) - 200,
      };

      const validCode: AuthorizationCode = {
        code: 'valid-code',
        client_id: 'test-client',
        user_id: 'test-user',
        redirect_uri: 'http://localhost:8080/callback',
        scopes: ['read'],
        expires_at: Math.floor(Date.now() / 1000) + 600, // Valid
        created_at: Math.floor(Date.now() / 1000),
      };

      await storage.saveAuthorizationCode(expiredCode);
      await storage.saveAuthorizationCode(validCode);

      await storage.cleanupExpiredTokens();

      expect(await storage.getAuthorizationCode('expired-code')).toBeNull();
      expect(await storage.getAuthorizationCode('valid-code')).not.toBeNull();
    });

    it('should clean up expired access tokens', async () => {
      const expiredToken: AccessToken = {
        token: 'expired-token',
        client_id: 'test-client',
        user_id: 'test-user',
        scopes: ['read'],
        expires_at: Math.floor(Date.now() / 1000) - 100, // Expired
        created_at: Math.floor(Date.now() / 1000) - 200,
        token_type: 'Bearer',
      };

      const validToken: AccessToken = {
        token: 'valid-token',
        client_id: 'test-client',
        user_id: 'test-user',
        scopes: ['read'],
        expires_at: Math.floor(Date.now() / 1000) + 3600, // Valid
        created_at: Math.floor(Date.now() / 1000),
        token_type: 'Bearer',
      };

      await storage.saveAccessToken(expiredToken);
      await storage.saveAccessToken(validToken);

      await storage.cleanupExpiredTokens();

      expect(await storage.getAccessToken('expired-token')).toBeNull();
      expect(await storage.getAccessToken('valid-token')).not.toBeNull();
    });

    it('should clean up expired refresh tokens', async () => {
      const expiredToken: RefreshToken = {
        token: 'expired-refresh-token',
        client_id: 'test-client',
        user_id: 'test-user',
        scopes: ['read'],
        expires_at: Math.floor(Date.now() / 1000) - 100, // Expired
        created_at: Math.floor(Date.now() / 1000) - 200,
      };

      const neverExpiresToken: RefreshToken = {
        token: 'never-expires-token',
        client_id: 'test-client',
        user_id: 'test-user',
        scopes: ['read'],
        expires_at: 0, // Never expires
        created_at: Math.floor(Date.now() / 1000),
      };

      await storage.saveRefreshToken(expiredToken);
      await storage.saveRefreshToken(neverExpiresToken);

      await storage.cleanupExpiredTokens();

      expect(await storage.getRefreshToken('expired-refresh-token')).toBeNull();
      expect(
        await storage.getRefreshToken('never-expires-token'),
      ).not.toBeNull();
    });
  });

  describe('Development Helpers', () => {
    it('should return all clients', async () => {
      const client1: ClientRegistration = {
        client_id: 'client-1',
        client_secret: 'secret-1',
        redirect_uris: ['http://localhost:8080/callback'],
      };

      const client2: ClientRegistration = {
        client_id: 'client-2',
        client_secret: 'secret-2',
        redirect_uris: ['http://localhost:8081/callback'],
      };

      await storage.saveClient(client1);
      await storage.saveClient(client2);

      const clients = await storage.getAllClients();
      expect(clients).toHaveLength(2);
      expect(clients.some((c) => c.client_id === 'client-1')).toBe(true);
      expect(clients.some((c) => c.client_id === 'client-2')).toBe(true);
    });

    it('should return all tokens', async () => {
      const accessToken: AccessToken = {
        token: 'access-token',
        client_id: 'test-client',
        user_id: 'test-user',
        scopes: ['read'],
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        created_at: Math.floor(Date.now() / 1000),
        token_type: 'Bearer',
      };

      const refreshToken: RefreshToken = {
        token: 'refresh-token',
        client_id: 'test-client',
        user_id: 'test-user',
        scopes: ['read'],
        expires_at: 0,
        created_at: Math.floor(Date.now() / 1000),
      };

      await storage.saveAccessToken(accessToken);
      await storage.saveRefreshToken(refreshToken);

      const tokens = await storage.getAllTokens();
      expect(tokens.accessTokens).toHaveLength(1);
      expect(tokens.refreshTokens).toHaveLength(1);
      expect(tokens.accessTokens[0].token).toBe('access-token');
      expect(tokens.refreshTokens[0].token).toBe('refresh-token');
    });

    it('should clear all data', async () => {
      // Add some data
      await storage.saveClient({
        client_id: 'test-client',
        redirect_uris: ['http://localhost:8080/callback'],
      });

      await storage.saveAccessToken({
        token: 'test-token',
        client_id: 'test-client',
        user_id: 'test-user',
        scopes: ['read'],
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        created_at: Math.floor(Date.now() / 1000),
        token_type: 'Bearer',
      });

      // Clear all data
      await storage.clear();

      // Verify everything is gone
      expect(await storage.getClient('test-client')).toBeNull();
      expect(await storage.getAccessToken('test-token')).toBeNull();
      expect(await storage.getAllClients()).toHaveLength(0);
      const tokens = await storage.getAllTokens();
      expect(tokens.accessTokens).toHaveLength(0);
      expect(tokens.refreshTokens).toHaveLength(0);
    });
  });
});
