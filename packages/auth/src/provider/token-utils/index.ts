import { handleRefreshTokenGrant } from './handleRefreshTokenGrant.js';

import { generateRefreshTokenRecord } from './generateRefreshTokenRecord.js';
import { handleAuthorizationCodeGrant } from './handleAuthorizationCodeGrant.js';
import { handleAuthorizationRequest } from './handleAuthorizationRequest.js';

export { type Result, ok, err } from './result.js';
import type {
  AuthorizationRequest,
  IOAuthProviderStorage,
  IUserConsentService,
  OAuthProviderConfig,
  RefreshToken,
  TokenRequest,
} from '@mcp-funnel/models';

export class TokenUtils {
  public constructor(
    private readonly config: OAuthProviderConfig,
    private readonly storage: IOAuthProviderStorage,
  ) {}

  public generateRefreshTokenRecord(
    clientId: string,
    userId: string,
    scopes: string[],
    defaultRefreshTokenExpiry = 2592000,
  ): RefreshToken {
    return generateRefreshTokenRecord(clientId, userId, scopes, defaultRefreshTokenExpiry);
  }

  public async handleAuthorizationCodeGrant(params: TokenRequest) {
    return handleAuthorizationCodeGrant(this.config, this.storage, params);
  }

  public async handleRefreshTokenGrant(params: TokenRequest) {
    return handleRefreshTokenGrant(this.config, this.storage, params);
  }

  public async revokeToken(
    token: string,
    clientId: string,
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    // Try to find as access token first
    const accessToken = await this.storage.getAccessToken(token);
    if (accessToken) {
      if (accessToken.client_id !== clientId) {
        return { success: false, error: 'Token not owned by client' };
      }
      await this.storage.deleteAccessToken(token);
      return { success: true };
    }

    // Try to find as refresh token
    const refreshToken = await this.storage.getRefreshToken(token);
    if (refreshToken) {
      if (refreshToken.client_id !== clientId) {
        return { success: false, error: 'Token not owned by client' };
      }
      await this.storage.deleteRefreshToken(token);
      return { success: true };
    }

    // Token not found - this is not an error per RFC 7009
    return { success: true };
  }

  public handleAuthorizationRequest(
    consentService: IUserConsentService,
    params: Partial<AuthorizationRequest>,
    userId: string,
  ) {
    return handleAuthorizationRequest(this.config, this.storage, consentService, params, userId);
  }
}
