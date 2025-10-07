import { OAuthUtils } from '../../utils/index.js';

import { generateRefreshTokenRecord } from './generateRefreshTokenRecord.js';
import {
  type AccessToken,
  type IOAuthProviderStorage,
  type OAuthError,
  OAuthErrorCodes,
  type OAuthProviderConfig,
  type RefreshToken,
  type TokenRequest,
  type TokenResponse,
} from '@mcp-funnel/models';

const {
  formatScopes,
  generateAccessToken,
  getCurrentTimestamp,
  isExpired,
  validateClientCredentials,
  validatePkceChallenge,
} = OAuthUtils;

export const handleAuthorizationCodeGrant = async (
  config: OAuthProviderConfig,
  storage: IOAuthProviderStorage,
  params: TokenRequest,
): Promise<{
  success: boolean;
  tokenResponse?: TokenResponse;
  error?: OAuthError;
}> => {
  const { code, redirect_uri, client_id, client_secret, code_verifier } = params;

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

  // Get authorization code
  const authCode = await storage.getAuthorizationCode(code!);
  if (!authCode) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Invalid authorization code',
      },
    };
  }

  // Check if code is expired
  if (isExpired(authCode.expires_at)) {
    await storage.deleteAuthorizationCode(code!);
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Authorization code expired',
      },
    };
  }

  // Validate client matches
  if (authCode.client_id !== client_id) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Authorization code was not issued to this client',
      },
    };
  }

  // Validate redirect URI matches
  if (authCode.redirect_uri !== redirect_uri) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Invalid redirect_uri',
      },
    };
  }

  // Validate PKCE if present
  if (authCode.code_challenge) {
    if (!code_verifier) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'code_verifier is required',
        },
      };
    }

    if (
      !validatePkceChallenge(
        code_verifier,
        authCode.code_challenge,
        authCode.code_challenge_method || 'plain',
      )
    ) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_GRANT,
          error_description: 'Invalid PKCE code verifier',
        },
      };
    }
  }

  // Delete authorization code (single use)
  await storage.deleteAuthorizationCode(code!);

  // Generate access token
  const accessToken: AccessToken = {
    token: generateAccessToken(),
    client_id,
    user_id: authCode.user_id,
    scopes: authCode.scopes,
    expires_at: getCurrentTimestamp() + config.defaultTokenExpiry,
    created_at: getCurrentTimestamp(),
    token_type: 'Bearer',
  };

  await storage.saveAccessToken(accessToken);

  // Generate refresh token if enabled
  let refreshToken: RefreshToken | undefined;
  if (config.issueRefreshTokens) {
    refreshToken = generateRefreshTokenRecord(
      client_id,
      authCode.user_id,
      authCode.scopes,
      config.defaultRefreshTokenExpiry,
    );

    await storage.saveRefreshToken(refreshToken);
  }

  const tokenResponse: TokenResponse = {
    access_token: accessToken.token,
    token_type: 'Bearer',
    expires_in: config.defaultTokenExpiry,
    scope: formatScopes(authCode.scopes),
  };

  if (refreshToken) {
    tokenResponse.refresh_token = refreshToken.token;
  }

  return { success: true, tokenResponse };
};
