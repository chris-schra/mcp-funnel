import { OAuthUtils } from '../../utils/index.js';
import {
  type AuthorizationCode,
  type AuthorizationRequest,
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

export const handleAuthorizationRequest = async (
  config: OAuthProviderConfig,
  storage: IOAuthProviderStorage,
  consentService: IUserConsentService,
  params: Partial<AuthorizationRequest>,
  userId: string, // Assumes user is already authenticated
): Promise<{
  success: boolean;
  authorizationCode?: string;
  redirectUri?: string;
  state?: string;
  error?: OAuthError;
}> => {
  // Validate request parameters
  const validation = validateAuthorizationRequest(params);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const {
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
  } = params as AuthorizationRequest;

  // Get client information
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

  // Validate redirect URI
  if (!validateRedirectUri(client, redirect_uri)) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Invalid redirect_uri',
      },
    };
  }

  // Parse and validate scopes
  const requestedScopes = parseScopes(scope);
  if (!validateScopes(requestedScopes, config.supportedScopes)) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_SCOPE,
        error_description: 'Invalid scope',
      },
    };
  }

  // Check PKCE requirements for public clients
  if (!client.client_secret && config.requirePkce && !code_challenge) {
    return {
      success: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'PKCE is required for public clients',
      },
    };
  }

  // Check user consent
  const hasConsent = await consentService.hasUserConsented(
    userId,
    client_id,
    requestedScopes,
  );

  if (!hasConsent) {
    const consentParams = new URLSearchParams({
      client_id,
    });
    if (scope) {
      consentParams.set('scope', scope);
    }
    if (state) {
      consentParams.set('state', state);
    }
    if (redirect_uri) {
      consentParams.set('redirect_uri', redirect_uri);
    }
    if (code_challenge) {
      consentParams.set('code_challenge', code_challenge);
    }
    if (code_challenge_method) {
      consentParams.set('code_challenge_method', code_challenge_method);
    }

    return {
      success: false,
      error: {
        error: OAuthErrorCodes.CONSENT_REQUIRED,
        error_description: 'User consent is required for the requested scopes',
        consent_uri: `/api/oauth/consent?${consentParams.toString()}`,
      },
    };
  }

  // Generate authorization code
  const code = generateAuthorizationCode();
  const authCode: AuthorizationCode = {
    code,
    client_id,
    user_id: userId,
    redirect_uri,
    scopes: requestedScopes,
    code_challenge,
    code_challenge_method,
    state,
    expires_at: getCurrentTimestamp() + config.defaultCodeExpiry,
    created_at: getCurrentTimestamp(),
  };

  await storage.saveAuthorizationCode(authCode);

  return {
    success: true,
    authorizationCode: code,
    redirectUri: redirect_uri,
    state,
  };
};
