import { OAuthUtils } from '../../utils/index.js';
import {
  type AuthorizationCode,
  type AuthorizationRequest,
  type ClientRegistration,
  type IOAuthProviderStorage,
  type IUserConsentService,
  type OAuthError,
  OAuthErrorCodes,
  type OAuthProviderConfig,
} from '@mcp-funnel/models';

const {
  generateAuthorizationCode,
  getCurrentTimestamp,
  parseScopes,
  validateAuthorizationRequest,
  validateRedirectUri,
  validateScopes,
} = OAuthUtils;

type ErrorResult = { success: false; error: OAuthError };

const validateClient = async (
  storage: IOAuthProviderStorage,
  clientId: string,
): Promise<ClientRegistration | ErrorResult> => {
  const client = await storage.getClient(clientId);
  if (!client) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_CLIENT,
        error_description: 'Invalid client_id',
      },
    };
  }
  return client;
};

const validateRedirectUriOrError = (
  client: ClientRegistration,
  redirectUri: string,
): ErrorResult | undefined => {
  if (!validateRedirectUri(client, redirectUri)) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Invalid redirect_uri',
      },
    };
  }
};

const validateScopesOrError = (
  scope: string | undefined,
  supportedScopes: string[],
): string[] | ErrorResult => {
  const requestedScopes = parseScopes(scope ?? '');
  if (!validateScopes(requestedScopes, supportedScopes)) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_SCOPE,
        error_description: 'Invalid scope',
      },
    };
  }
  return requestedScopes;
};

const validatePkceOrError = (
  client: ClientRegistration,
  requirePkce: boolean,
  codeChallenge: string | undefined,
): ErrorResult | undefined => {
  if (!client.client_secret && requirePkce && !codeChallenge) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'PKCE is required for public clients',
      },
    };
  }
};

const buildConsentError = (params: AuthorizationRequest): ErrorResult => {
  const consentParams = new URLSearchParams({ client_id: params.client_id });
  if (params.scope) consentParams.set('scope', params.scope);
  if (params.state) consentParams.set('state', params.state);
  if (params.redirect_uri) {
    consentParams.set('redirect_uri', params.redirect_uri);
  }
  if (params.code_challenge) {
    consentParams.set('code_challenge', params.code_challenge);
  }
  if (params.code_challenge_method) {
    consentParams.set('code_challenge_method', params.code_challenge_method);
  }

  return {
    success: false,
    error: {
      error: OAuthErrorCodes.CONSENT_REQUIRED,
      error_description: 'User consent is required for the requested scopes',
      consent_uri: `/api/oauth/consent?${consentParams.toString()}`,
    },
  };
};

const createAuthCode = (
  params: AuthorizationRequest,
  userId: string,
  requestedScopes: string[],
  config: OAuthProviderConfig,
): AuthorizationCode => {
  const code = generateAuthorizationCode();
  const timestamp = getCurrentTimestamp();

  return {
    code,
    client_id: params.client_id,
    user_id: userId,
    redirect_uri: params.redirect_uri,
    scopes: requestedScopes,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method,
    state: params.state,
    expires_at: timestamp + config.defaultCodeExpiry,
    created_at: timestamp,
  };
};

export const handleAuthorizationRequest = async (
  config: OAuthProviderConfig,
  storage: IOAuthProviderStorage,
  consentService: IUserConsentService,
  params: Partial<AuthorizationRequest>,
  userId: string,
): Promise<{
  success: boolean;
  authorizationCode?: string;
  redirectUri?: string;
  state?: string;
  error?: OAuthError;
}> => {
  const validation = validateAuthorizationRequest(params);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const validParams = params as AuthorizationRequest;

  const clientOrError = await validateClient(storage, validParams.client_id);
  if ('success' in clientOrError) return clientOrError;

  const redirectError = validateRedirectUriOrError(
    clientOrError,
    validParams.redirect_uri,
  );
  if (redirectError) return redirectError;

  const scopesOrError = validateScopesOrError(
    validParams.scope,
    config.supportedScopes,
  );
  if ('success' in scopesOrError) return scopesOrError;

  const pkceError = validatePkceOrError(
    clientOrError,
    config.requirePkce,
    validParams.code_challenge,
  );
  if (pkceError) return pkceError;

  const hasConsent = await consentService.hasUserConsented(
    userId,
    validParams.client_id,
    scopesOrError,
  );
  if (!hasConsent) return buildConsentError(validParams);

  const authCode = createAuthCode(validParams, userId, scopesOrError, config);
  await storage.saveAuthorizationCode(authCode);

  return {
    success: true,
    authorizationCode: authCode.code,
    redirectUri: validParams.redirect_uri,
    state: validParams.state,
  };
};
