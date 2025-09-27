import { AuthConfigZod } from '../../config.js';
import {
  OAuth2ClientCredentialsProvider,
  OAuth2AuthCodeProvider,
  BearerTokenAuthProvider,
  type IAuthProvider,
  type ITokenStorage,
} from '../../auth/index.js';
import { TokenStorageFactory } from '../../auth/token-storage-factory.js';
import { logEvent } from '../../logger.js';
import {
  IAuthProviderFactory,
  AuthProviderResult,
} from '../interfaces/auth-provider-factory.interface.js';

export class AuthProviderFactory implements IAuthProviderFactory {
  createAuthProvider(
    authConfig?: AuthConfigZod,
    serverName?: string,
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
        const _exhaustive: never = authConfig;
        throw new Error(
          `Unsupported auth type: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  }

  async completeOAuthFlow(state: string, code: string): Promise<void> {
    // Use O(1) lookup to find the provider for this state
    const provider = OAuth2AuthCodeProvider.getProviderForState(state);

    if (!provider) {
      throw new Error('No matching OAuth flow found for this state parameter');
    }

    try {
      await provider.completeOAuthFlow(state, code);
      logEvent('info', 'auth-provider-factory:oauth_completed', { state });
    } catch (error) {
      logEvent('error', 'auth-provider-factory:oauth_completion_failed', {
        state,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
