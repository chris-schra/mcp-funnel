import type { ClientRegistration } from './ClientRegistration.js';
import type { AuthorizationCode } from './AuthorizationCode.js';
import type { AccessToken } from './AccessToken.js';
import type { RefreshToken } from './RefreshToken.js';

/**
 * Storage interface for OAuth provider data
 */
export interface IOAuthProviderStorage {
  // Client management
  saveClient(client: ClientRegistration): Promise<void>;
  getClient(clientId: string): Promise<ClientRegistration | null>;
  deleteClient(clientId: string): Promise<void>;

  // Authorization code management
  saveAuthorizationCode(code: AuthorizationCode): Promise<void>;
  getAuthorizationCode(code: string): Promise<AuthorizationCode | null>;
  deleteAuthorizationCode(code: string): Promise<void>;

  // Access token management
  saveAccessToken(token: AccessToken): Promise<void>;
  getAccessToken(token: string): Promise<AccessToken | null>;
  deleteAccessToken(token: string): Promise<void>;

  // Refresh token management
  saveRefreshToken(token: RefreshToken): Promise<void>;
  getRefreshToken(token: string): Promise<RefreshToken | null>;
  deleteRefreshToken(token: string): Promise<void>;

  // Cleanup expired tokens
  cleanupExpiredTokens(): Promise<void>;
}
