import { AuthConfigZod } from '../../config.js';
import { IAuthProvider, ITokenStorage } from '../../auth/index.js';

export interface AuthProviderResult {
  provider: IAuthProvider;
  tokenStorage?: ITokenStorage;
}

export interface IAuthProviderFactory {
  /**
   * Creates an appropriate auth provider based on the authentication configuration
   */
  createAuthProvider(
    authConfig?: AuthConfigZod,
    serverName?: string,
    resolvedEnv?: Record<string, string>,
  ): AuthProviderResult | undefined;

  /**
   * Complete OAuth2 authorization code flow
   */
  completeOAuthFlow(state: string, code: string): Promise<void>;
}
