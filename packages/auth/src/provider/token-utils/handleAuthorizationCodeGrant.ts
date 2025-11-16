import { OAuthUtils } from '../../utils/index.js';

import { generateRefreshTokenRecord } from './generateRefreshTokenRecord.js';
import {
  type AccessToken,
  type AuthorizationCode,
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

type ValidationResult = { error?: OAuthError };

const validateClient = async (
  storage: IOAuthProviderStorage,
  client_id: string,
  client_secret?: string,
): Promise<ValidationResult> => {
  const client = await storage.getClient(client_id);
  if (!client) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_CLIENT,
        error_description: 'Invalid client_id',
      },
    };
  }

  if (!validateClientCredentials(client, client_secret)) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_CLIENT,
        error_description: 'Invalid client credentials',
      },
    };
  }

  return {};
};

const validateAuthCode = async (
  storage: IOAuthProviderStorage,
  code: string,
  client_id: string,
  redirect_uri: string,
): Promise<{ authCode?: AuthorizationCode; error?: OAuthError }> => {
  const authCode = await storage.getAuthorizationCode(code);
  if (!authCode) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Invalid authorization code',
      },
    };
  }

  if (isExpired(authCode.expires_at)) {
    await storage.deleteAuthorizationCode(code);
    return {
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Authorization code expired',
      },
    };
  }

  if (authCode.client_id !== client_id) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Authorization code was not issued to this client',
      },
    };
  }

  if (authCode.redirect_uri !== redirect_uri) {
    return {
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Invalid redirect_uri',
      },
    };
  }

  return { authCode };
};

const validatePkce = (authCode: AuthorizationCode, code_verifier?: string): ValidationResult => {
  if (!authCode.code_challenge) {
    return {};
  }

  if (!code_verifier) {
    return {
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
      error: {
        error: OAuthErrorCodes.INVALID_GRANT,
        error_description: 'Invalid PKCE code verifier',
      },
    };
  }

  return {};
};

const generateTokens = async (
  storage: IOAuthProviderStorage,
  config: OAuthProviderConfig,
  authCode: AuthorizationCode,
  client_id: string,
): Promise<{ accessToken: AccessToken; refreshToken?: RefreshToken }> => {
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

  return { accessToken, refreshToken };
};

const buildTokenResponse = (
  accessToken: AccessToken,
  config: OAuthProviderConfig,
  authCode: AuthorizationCode,
  refreshToken?: RefreshToken,
): TokenResponse => {
  const tokenResponse: TokenResponse = {
    access_token: accessToken.token,
    token_type: 'Bearer',
    expires_in: config.defaultTokenExpiry,
    scope: formatScopes(authCode.scopes),
  };

  if (refreshToken) {
    tokenResponse.refresh_token = refreshToken.token;
  }

  return tokenResponse;
};

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

  const clientValidation = await validateClient(storage, client_id, client_secret);
  if (clientValidation.error) {
    return { success: false, error: clientValidation.error };
  }

  const authCodeValidation = await validateAuthCode(storage, code!, client_id, redirect_uri!);
  if (authCodeValidation.error) {
    return { success: false, error: authCodeValidation.error };
  }

  const authCode = authCodeValidation.authCode!;

  const pkceValidation = validatePkce(authCode, code_verifier);
  if (pkceValidation.error) {
    return { success: false, error: pkceValidation.error };
  }

  await storage.deleteAuthorizationCode(code!);

  const { accessToken, refreshToken } = await generateTokens(storage, config, authCode, client_id);

  const tokenResponse = buildTokenResponse(accessToken, config, authCode, refreshToken);

  return { success: true, tokenResponse };
};
