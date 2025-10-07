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
import { type Result, err, ok } from './result.js';

const {
  formatScopes,
  generateAccessToken,
  getCurrentTimestamp,
  isExpired,
  parseScopes,
  validateClientCredentials,
} = OAuthUtils;

const validateClient = async (
  storage: IOAuthProviderStorage,
  clientId: string,
  clientSecret?: string,
): Promise<Result<ClientRegistration, OAuthError>> => {
  const client = await storage.getClient(clientId);
  if (!client) {
    return err({
      error: OAuthErrorCodes.INVALID_CLIENT,
      error_description: 'Invalid client_id',
    });
  }

  if (!validateClientCredentials(client, clientSecret)) {
    return err({
      error: OAuthErrorCodes.INVALID_CLIENT,
      error_description: 'Invalid client credentials',
    });
  }

  return ok(client);
};

const validateRefreshToken = async (
  storage: IOAuthProviderStorage,
  refreshToken: string,
  clientId: string,
): Promise<Result<RefreshToken, OAuthError>> => {
  const refreshTokenData = await storage.getRefreshToken(refreshToken);
  if (!refreshTokenData) {
    return err({
      error: OAuthErrorCodes.INVALID_GRANT,
      error_description: 'Invalid refresh token',
    });
  }

  if (refreshTokenData.expires_at > 0 && isExpired(refreshTokenData.expires_at)) {
    await storage.deleteRefreshToken(refreshToken);
    return err({
      error: OAuthErrorCodes.INVALID_GRANT,
      error_description: 'Refresh token expired',
    });
  }

  if (refreshTokenData.client_id !== clientId) {
    return err({
      error: OAuthErrorCodes.INVALID_GRANT,
      error_description: 'Refresh token was not issued to this client',
    });
  }

  return ok(refreshTokenData);
};

const validateScopes = (
  requestedScope: string | undefined,
  originalScopes: string[],
): Result<string[], OAuthError> => {
  if (!requestedScope) {
    return ok(originalScopes);
  }

  const requestedScopes = parseScopes(requestedScope);
  if (!requestedScopes.every((s) => originalScopes.includes(s))) {
    return err({
      error: OAuthErrorCodes.INVALID_SCOPE,
      error_description: 'Requested scope exceeds original grant',
    });
  }

  return ok(requestedScopes);
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

  // Validate required refresh_token parameter
  if (!refresh_token) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'refresh_token is required',
      },
    };
  }

  // Validate client credentials
  const clientResult = await validateClient(storage, client_id, client_secret);
  if (!clientResult.ok) {
    return { success: false, error: clientResult.error };
  }

  // Validate refresh token
  const tokenResult = await validateRefreshToken(storage, refresh_token, client_id);
  if (!tokenResult.ok) {
    return { success: false, error: tokenResult.error };
  }

  // Validate requested scopes
  const scopeResult = validateScopes(scope, tokenResult.value.scopes);
  if (!scopeResult.ok) {
    return { success: false, error: scopeResult.error };
  }

  // Create token response
  const tokenResponse = await createTokenResponse(
    config,
    storage,
    client_id,
    tokenResult.value.user_id,
    scopeResult.value,
    refresh_token,
  );

  return { success: true, tokenResponse };
};
