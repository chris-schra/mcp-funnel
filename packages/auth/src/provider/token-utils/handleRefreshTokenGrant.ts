import { generateRefreshTokenRecord } from './generateRefreshTokenRecord.js';
import { OAuthUtils } from '../../utils/index.js';
import {
  type AccessToken,
  type IOAuthProviderStorage,
  type OAuthError,
  OAuthErrorCodes,
  type OAuthProviderConfig,
  type TokenRequest,
  type TokenResponse,
} from '@mcp-funnel/models';

const {
  formatScopes,
  generateAccessToken,
  getCurrentTimestamp,
  isExpired,
  parseScopes,
  validateClientCredentials,
} = OAuthUtils;

export const handleRefreshTokenGrant = async (
  config: OAuthProviderConfig,
  storage: IOAuthProviderStorage,
  params: TokenRequest,
): Promise<{
  success: boolean;
  tokenResponse?: TokenResponse;
  error?: OAuthError;
}> => {
  const { refresh_token, client_id, client_secret, scope } = params;

  // Get client
  const client = await storage.getClient(client_id);
  if (!client) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_CLIENT,
        error_description: 'Invalid client_id',
      },
    };
  }

  // Validate client credentials
  if (!validateClientCredentials(client, client_secret)) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_CLIENT,
        error_description: 'Invalid client credentials',
      },
    };
  }

  // Get refresh token
  const refreshTokenData = await storage.getRefreshToken(refresh_token!);
  if (!refreshTokenData) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Invalid refresh token',
      },
    };
  }

  // Check if refresh token is expired
  if (refreshTokenData.expires_at > 0 && isExpired(refreshTokenData.expires_at)) {
    await storage.deleteRefreshToken(refresh_token!);
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Refresh token expired',
      },
    };
  }

  // Validate client matches
  if (refreshTokenData.client_id !== client_id) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Refresh token was not issued to this client',
      },
    };
  }

  // Handle scope parameter
  let grantedScopes = refreshTokenData.scopes;
  if (scope) {
    const requestedScopes = parseScopes(scope);
    // Requested scopes must be a subset of original scopes
    if (!requestedScopes.every((s) => refreshTokenData.scopes.includes(s))) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_SCOPE,
          error_description: 'Requested scope exceeds original grant',
        },
      };
    }
    grantedScopes = requestedScopes;
  }

  // Generate new access token
  const accessToken: AccessToken = {
    token: generateAccessToken(),
    client_id,
    user_id: refreshTokenData.user_id,
    scopes: grantedScopes,
    expires_at: getCurrentTimestamp() + config.defaultTokenExpiry,
    created_at: getCurrentTimestamp(),
    token_type: 'Bearer',
  };

  await storage.saveAccessToken(accessToken);

  const tokenResponse: TokenResponse = {
    access_token: accessToken.token,
    token_type: 'Bearer',
    expires_in: config.defaultTokenExpiry,
    scope: formatScopes(grantedScopes),
  };

  if (config.requireTokenRotation && config.issueRefreshTokens) {
    const rotatedRefreshToken = generateRefreshTokenRecord(
      client_id,
      refreshTokenData.user_id,
      grantedScopes,
      config.defaultRefreshTokenExpiry,
    );
    await storage.saveRefreshToken(rotatedRefreshToken);
    await storage.deleteRefreshToken(refresh_token!);
    tokenResponse.refresh_token = rotatedRefreshToken.token;
  }

  return { success: true, tokenResponse };
};
