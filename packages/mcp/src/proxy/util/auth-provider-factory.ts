/**
 * Auth provider factory for creating authentication providers
 * Extracted from MCPProxy to reduce file size
 */

import type { AuthConfigZod } from '@mcp-funnel/schemas';
import type { IAuthProvider, ITokenStorage } from '@mcp-funnel/core';
import {
  BearerTokenAuthProvider,
  OAuth2AuthCodeProvider,
  OAuth2ClientCredentialsProvider,
  TokenStorageFactory,
} from '@mcp-funnel/auth';

/**
 * Result of creating an auth provider
 */
export interface AuthProviderResult {
  provider: IAuthProvider;
  tokenStorage?: ITokenStorage;
}

/**
 * Creates an appropriate auth provider based on the authentication configuration
 */
export function createAuthProvider(
  authConfig: AuthConfigZod | undefined,
  serverName: string | undefined,
  resolvedEnv?: Record<string, string>,
): AuthProviderResult | undefined {
  if (!authConfig || authConfig.type === 'none') {
    return undefined;
  }

  switch (authConfig.type) {
    case 'bearer': {
      return {
        provider: new BearerTokenAuthProvider({
          token: authConfig.token,
          env: resolvedEnv,
        }),
      };
    }
    case 'oauth2-client': {
      const tokenStorage = TokenStorageFactory.create('auto', serverName);
      return {
        provider: new OAuth2ClientCredentialsProvider(
          {
            type: 'oauth2-client',
            clientId: authConfig.clientId,
            clientSecret: authConfig.clientSecret,
            tokenEndpoint: authConfig.tokenEndpoint,
            scope: authConfig.scope,
            audience: authConfig.audience,
          },
          tokenStorage,
        ),
        tokenStorage,
      };
    }
    case 'oauth2-code': {
      const tokenStorage = TokenStorageFactory.create('auto', serverName);
      return {
        provider: new OAuth2AuthCodeProvider(
          {
            type: 'oauth2-code',
            clientId: authConfig.clientId,
            clientSecret: authConfig.clientSecret,
            authorizationEndpoint: authConfig.authorizationEndpoint,
            tokenEndpoint: authConfig.tokenEndpoint,
            redirectUri: authConfig.redirectUri,
            scope: authConfig.scope,
            audience: authConfig.audience,
          },
          tokenStorage,
        ),
        tokenStorage,
      };
    }
    default: {
      throw new Error(`Unsupported auth type: ${JSON.stringify(authConfig)}`);
    }
  }
}
