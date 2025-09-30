/**
 * Factory for creating authentication providers from configuration.
 * Supports bearer token, OAuth2 client credentials, and OAuth2 authorization code flows.
 * Extracted from MCPProxy to reduce file size and improve testability.
 * @public
 * @see file:../../mcp-proxy.ts - Main proxy implementation
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
 * Result of creating an authentication provider.
 * @public
 */
export interface AuthProviderResult {
  /** Authentication provider instance */
  provider: IAuthProvider;
  /** Token storage instance for OAuth2 flows (undefined for bearer tokens) */
  tokenStorage?: ITokenStorage;
}

/**
 * Creates an authentication provider based on the provided configuration.
 * For OAuth2 flows (client credentials and authorization code), automatically creates
 * token storage using TokenStorageFactory with 'auto' mode (keychain on macOS, memory fallback).
 * Bearer tokens do not require token storage.
 * @param {AuthConfigZod | undefined} authConfig - Authentication configuration from server config
 * @param {string | undefined} serverName - Server identifier for token storage namespacing
 * @param {Record<string, string>} [resolvedEnv] - Environment variables available to the provider
 * @returns {AuthProviderResult | undefined} Auth provider and optional token storage, or undefined for 'none' auth type
 * @throws {Error} When authConfig contains an unsupported auth type
 * @example
 * ```typescript
 * const result = createAuthProvider(
 *   { type: 'bearer', token: 'sk-...' },
 *   'my-server',
 *   process.env
 * );
 * ```
 * @public
 * @see file:./connection-setup.ts:97 - Usage in server connection
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
