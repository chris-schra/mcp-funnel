/**
 * In-memory storage implementation for OAuth provider
 * This is a simple implementation for development/testing
 * Production deployments should use persistent storage
 */
import type {
  AccessToken,
  AuthorizationCode,
  ClientRegistration,
  IOAuthProviderStorage,
  RefreshToken,
} from '@mcp-funnel/models';

export class MemoryOAuthStorage implements IOAuthProviderStorage {
  private clients = new Map<string, ClientRegistration>();
  private authorizationCodes = new Map<string, AuthorizationCode>();
  private accessTokens = new Map<string, AccessToken>();
  private refreshTokens = new Map<string, RefreshToken>();

  // Client management
  public async saveClient(client: ClientRegistration): Promise<void> {
    this.clients.set(client.client_id, { ...client });
  }

  public async getClient(clientId: string): Promise<ClientRegistration | null> {
    const client = this.clients.get(clientId);
    return client ? { ...client } : null;
  }

  public async deleteClient(clientId: string): Promise<void> {
    this.clients.delete(clientId);
  }

  // Authorization code management
  public async saveAuthorizationCode(code: AuthorizationCode): Promise<void> {
    this.authorizationCodes.set(code.code, { ...code });
  }

  public async getAuthorizationCode(code: string): Promise<AuthorizationCode | null> {
    const authCode = this.authorizationCodes.get(code);
    return authCode ? { ...authCode } : null;
  }

  public async deleteAuthorizationCode(code: string): Promise<void> {
    this.authorizationCodes.delete(code);
  }

  // Access token management
  public async saveAccessToken(token: AccessToken): Promise<void> {
    this.accessTokens.set(token.token, { ...token });
  }

  public async getAccessToken(token: string): Promise<AccessToken | null> {
    const accessToken = this.accessTokens.get(token);
    return accessToken ? { ...accessToken } : null;
  }

  public async deleteAccessToken(token: string): Promise<void> {
    this.accessTokens.delete(token);
  }

  // Refresh token management
  public async saveRefreshToken(token: RefreshToken): Promise<void> {
    this.refreshTokens.set(token.token, { ...token });
  }

  public async getRefreshToken(token: string): Promise<RefreshToken | null> {
    const refreshToken = this.refreshTokens.get(token);
    return refreshToken ? { ...refreshToken } : null;
  }

  public async deleteRefreshToken(token: string): Promise<void> {
    this.refreshTokens.delete(token);
  }

  // Cleanup expired tokens
  public async cleanupExpiredTokens(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Clean up expired authorization codes
    for (const [code, authCode] of this.authorizationCodes.entries()) {
      if (authCode.expires_at <= now) {
        this.authorizationCodes.delete(code);
      }
    }

    // Clean up expired access tokens
    for (const [token, accessToken] of this.accessTokens.entries()) {
      if (accessToken.expires_at <= now) {
        this.accessTokens.delete(token);
      }
    }

    // Clean up expired refresh tokens
    for (const [token, refreshToken] of this.refreshTokens.entries()) {
      if (refreshToken.expires_at > 0 && refreshToken.expires_at <= now) {
        this.refreshTokens.delete(token);
      }
    }
  }

  // Development helpers
  public async getAllClients(): Promise<ClientRegistration[]> {
    return Array.from(this.clients.values());
  }

  public async getAllTokens(): Promise<{
    accessTokens: AccessToken[];
    refreshTokens: RefreshToken[];
  }> {
    return {
      accessTokens: Array.from(this.accessTokens.values()),
      refreshTokens: Array.from(this.refreshTokens.values()),
    };
  }

  public async clear(): Promise<void> {
    this.clients.clear();
    this.authorizationCodes.clear();
    this.accessTokens.clear();
    this.refreshTokens.clear();
  }
}
