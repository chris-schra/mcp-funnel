import { generateRefreshTokenRecord } from './generateRefreshTokenRecord.js';
import { OAuthUtils } from '../../utils/index.js';
import {
  type AccessToken,
  type ClientRegistration,
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
  parseScopes,
  validateClientCredentials,
} = OAuthUtils;

type ClientValidationResult = {
  client?: ClientRegistration;
  error?: OAuthError;
};

type RefreshTokenValidationResult = {
  refreshTokenData?: RefreshToken;
  error?: OAuthError;
};

type ScopeValidationResult = {
  scopes?: string[];
  error?: OAuthError;
};

const validateClient = async (
  storage: IOAuthProviderStorage,
  clientId: string,
  clientSecret?: string,
): Promise<ClientValidationResult> => {
  const client = await storage.getClient(clientId);
  if (!client) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_CLIENT,
        error_description: 'Invalid client_id',
      },
    };
  }

  if (!validateClientCredentials(client, clientSecret)) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_CLIENT,
        error_description: 'Invalid client credentials',
      },
    };
  }

  return { client };
};

const validateRefreshToken = async (
  storage: IOAuthProviderStorage,
  refreshToken: string,
  clientId: string,
): Promise<RefreshTokenValidationResult> => {
  const refreshTokenData = await storage.getRefreshToken(refreshToken);
  if (!refreshTokenData) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Invalid refresh token',
      },
    };
  }

  if (refreshTokenData.expires_at > 0 && isExpired(refreshTokenData.expires_at)) {
    await storage.deleteRefreshToken(refreshToken);
    return {
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Refresh token expired',
      },
    };
  }

  if (refreshTokenData.client_id !== clientId) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Refresh token was not issued to this client',
      },
    };
  }

  return { refreshTokenData };
};

const validateScopes = (
  requestedScope: string | undefined,
  originalScopes: string[],
): ScopeValidationResult => {
  if (!requestedScope) {
    return { scopes: originalScopes };
  }

  const requestedScopes = parseScopes(requestedScope);
  if (!requestedScopes.every((s) => originalScopes.includes(s))) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_SCOPE,
        error_description: 'Requested scope exceeds original grant',
      },
    };
  }

  return { scopes: requestedScopes };
};

const createTokenResponse = async (
  config: OAuthProviderConfig,
  storage: IOAuthProviderStorage,
  clientId: string,
  userId: string,
  scopes: string[],
  refreshToken?: string,
): Promise<TokenResponse> => {
  const accessToken: AccessToken = {
    token: generateAccessToken(),
    client_id: clientId,
    user_id: userId,
    scopes,
    expires_at: getCurrentTimestamp() + config.defaultTokenExpiry,
    created_at: getCurrentTimestamp(),
    token_type: 'Bearer',
  };

  await storage.saveAccessToken(accessToken);

  const tokenResponse: TokenResponse = {
    access_token: accessToken.token,
    token_type: 'Bearer',
    expires_in: config.defaultTokenExpiry,
    scope: formatScopes(scopes),
  };

  if (config.requireTokenRotation && config.issueRefreshTokens && refreshToken) {
    const rotatedRefreshToken = generateRefreshTokenRecord(
      clientId,
      userId,
      scopes,
      config.defaultRefreshTokenExpiry,
    );
    await storage.saveRefreshToken(rotatedRefreshToken);
    await storage.deleteRefreshToken(refreshToken);
    tokenResponse.refresh_token = rotatedRefreshToken.token;
  }

  return tokenResponse;
};

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

  const clientResult = await validateClient(storage, client_id, client_secret);
  if (clientResult.error) {
    return { success: false, error: clientResult.error };
  }

  const tokenResult = await validateRefreshToken(storage, refresh_token!, client_id);
  if (tokenResult.error) {
    return { success: false, error: tokenResult.error };
  }

  const scopeResult = validateScopes(scope, tokenResult.refreshTokenData!.scopes);
  if (scopeResult.error) {
    return { success: false, error: scopeResult.error };
  }

  const tokenResponse = await createTokenResponse(
    config,
    storage,
    client_id,
    tokenResult.refreshTokenData!.user_id,
    scopeResult.scopes!,
    refresh_token,
  );

  return { success: true, tokenResponse };
};
