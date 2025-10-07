import { AuthenticationError, OAuth2ErrorCode } from '../errors/authentication-error.js';
import { type ITokenStorage, logEvent, type TokenData } from '@mcp-funnel/core';
import { BaseOAuthProvider } from './base-oauth-provider.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import { resolveOAuth2AuthCodeConfig } from '../utils/oauth-utils.js';
import {
  type AuthFlowContext,
  cleanupExpiredStates,
  cleanupPendingAuth,
  type PendingAuth,
} from '../utils/auth-flow.js';
import {
  completeOAuthFlow as completeOAuthFlowHelper,
  acquireToken as acquireTokenHelper,
  validateConfig as validateConfigHelper,
} from './util/oauth2-authorization-code-helpers.js';

/**
 * Cleanup registry for automatic resource cleanup when OAuth providers are garbage collected
 * This prevents memory leaks when destroy() is not called manually
 */
const cleanupRegistry = new FinalizationRegistry<NodeJS.Timeout>((intervalId) => {
  clearInterval(intervalId);
});

/**
 * OAuth2 Authorization Code provider implementing IAuthProvider
 *
 * Implements OAuth2 Authorization Code flow (RFC 6749 Section 4.1) with PKCE (RFC 7636)
 * for secure, browser-based user authorization. This provider is designed for scenarios
 * where users must interactively authorize the application in a web browser.
 *
 * Key features:
 * - PKCE (Proof Key for Code Exchange) for enhanced security without client secrets
 * - Concurrent flow support with state-based provider lookup
 * - Automatic state expiration and cleanup (10 minute expiry, 2 minute cleanup interval)
 * - Authorization timeout handling (5 minute default)
 * - Integration with HTTP callback routes (e.g., Hono server)
 * - Automatic resource cleanup via FinalizationRegistry
 * @remarks
 * This provider does NOT automatically open a browser. Users must manually visit the
 * authorization URL displayed in console output. This design choice avoids external
 * dependencies and gives users control over the authorization flow.
 *
 * Unlike client credentials flow, this provider does not support automatic token refresh
 * since refresh tokens typically require user interaction or are not issued for all flows.
 * @example Basic usage
 * ```typescript
 * import { OAuth2AuthCodeProvider, MemoryTokenStorage } from '@mcp-funnel/auth';
 *
 * const provider = new OAuth2AuthCodeProvider(
 *   {
 *     type: 'oauth2-code',
 *     clientId: 'my-client-id',
 *     authorizationEndpoint: 'https://oauth.example.com/authorize',
 *     tokenEndpoint: 'https://oauth.example.com/token',
 *     redirectUri: 'http://localhost:3000/callback',
 *     scope: 'read write'
 *   },
 *   new MemoryTokenStorage()
 * );
 *
 * // Get auth headers (triggers OAuth flow if no valid token)
 * const headers = await provider.getHeaders();
 *
 * // Clean up when done
 * provider.destroy();
 * ```
 * @example With callback handler
 * ```typescript
 * import { Hono } from 'hono';
 *
 * const app = new Hono();
 *
 * app.get('/oauth/callback', async (c) => {
 *   const state = c.req.query('state');
 *   const code = c.req.query('code');
 *
 *   const provider = OAuth2AuthCodeProvider.getProviderForState(state);
 *   if (!provider) {
 *     return c.text('Invalid OAuth state', 400);
 *   }
 *
 *   await provider.completeOAuthFlow(state, code);
 *   return c.text('Authorization successful!');
 * });
 * ```
 * @public
 * @see file:./base-oauth-provider.ts - Base OAuth provider implementation
 * @see file:../utils/pkce.ts - PKCE implementation (RFC 7636)
 * @see file:../utils/auth-flow.ts - Authorization flow state management
 */
export class OAuth2AuthCodeProvider extends BaseOAuthProvider {
  private readonly config: OAuth2AuthCodeConfig;
  private readonly authFlowContext: AuthFlowContext;
  private readonly cleanupInterval: NodeJS.Timeout;

  // Global state-to-provider mapping for O(1) lookup across all instances
  private static stateToProvider = new Map<string, OAuth2AuthCodeProvider>();

  private readonly AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Creates an OAuth2 Authorization Code provider with PKCE support
   *
   * Initializes the provider with configuration and storage, sets up periodic
   * cleanup for expired auth states, and registers for automatic resource cleanup
   * on garbage collection.
   * @param config - OAuth2 Authorization Code configuration including endpoints and client credentials
   * @param storage - Token storage implementation for persisting access tokens
   * @throws \{AuthenticationError\} When configuration validation fails (missing required fields or invalid URLs)
   * @example
   * ```typescript
   * import { OAuth2AuthCodeProvider, MemoryTokenStorage } from '@mcp-funnel/auth';
   *
   * const provider = new OAuth2AuthCodeProvider(
   *   {
   *     type: 'oauth2-code',
   *     clientId: 'my-client-id',
   *     authorizationEndpoint: 'https://oauth.example.com/authorize',
   *     tokenEndpoint: 'https://oauth.example.com/token',
   *     redirectUri: 'http://localhost:3000/callback',
   *     scope: 'read write'
   *   },
   *   new MemoryTokenStorage()
   * );
   * ```
   * @public
   * @see file:./base-oauth-provider.ts - Base provider implementation
   */
  public constructor(config: OAuth2AuthCodeConfig, storage: ITokenStorage) {
    super(storage);
    this.config = resolveOAuth2AuthCodeConfig(config);
    this.validateConfig();

    // Initialize auth flow context
    this.authFlowContext = {
      pendingAuthFlows: new Map<string, PendingAuth>(),
      stateToProvider: OAuth2AuthCodeProvider.stateToProvider,
    };

    // Start periodic cleanup of expired states (every 2 minutes)
    this.cleanupInterval = setInterval(
      () => {
        cleanupExpiredStates(this.authFlowContext, this.STATE_EXPIRY_MS, (state) => {
          logEvent('info', 'auth:oauth_state_expired', { state });
        });
      },
      2 * 60 * 1000,
    );

    // Register for automatic cleanup when instance is garbage collected
    // This prevents memory leaks if destroy() is not called manually
    cleanupRegistry.register(this, this.cleanupInterval);
  }

  /**
   * Ensures a valid token is available, acquiring one if necessary
   *
   * Overridden from base provider to avoid proactive refresh scheduling since
   * Authorization Code flow requires user interaction for token refresh.
   * @returns Promise resolving to valid token data
   * @throws \{AuthenticationError\} When token acquisition fails or storage retrieval fails
   * @internal
   * @override
   * @see file:./base-oauth-provider.ts:109 - Base implementation with proactive refresh
   */
  protected async ensureValidToken(): Promise<TokenData> {
    const existingToken = await this.storage.retrieve();

    if (existingToken && !(await this.storage.isExpired())) {
      return existingToken;
    }

    // Need to acquire new token through OAuth flow
    await this.refresh();

    const token = await this.storage.retrieve();
    if (!token) {
      throw new AuthenticationError(
        'Failed to acquire OAuth2 token',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    return token;
  }

  /**
   * Completes OAuth2 authorization flow with code from callback
   *
   * Called by the HTTP server callback route after user authorizes the application.
   * Supports concurrent flows using state-based lookup for multi-instance scenarios.
   * Exchanges the authorization code for an access token and resolves the pending promise.
   * @param state - OAuth2 state parameter from callback URL (must match pending flow)
   * @param code - Authorization code from callback URL to exchange for access token
   * @returns Promise that resolves when token exchange completes and token is stored
   * @throws \{AuthenticationError\} When state is invalid/expired or token exchange fails
   * @example
   * ```typescript
   * // In Hono callback route handler
   * app.get('/oauth/callback', async (c) => {
   *   const state = c.req.query('state');
   *   const code = c.req.query('code');
   *
   *   const provider = OAuth2AuthCodeProvider.getProviderForState(state);
   *   await provider.completeOAuthFlow(state, code);
   *
   *   return c.text('Authorization successful!');
   * });
   * ```
   * @public
   * @see file:../utils/auth-flow.ts:32 - State cleanup utilities
   */
  public async completeOAuthFlow(state: string, code: string): Promise<void> {
    return completeOAuthFlowHelper(
      {
        authFlowContext: this.authFlowContext,
        config: this.config,
        storage: this.storage,
        processTokenResponse: this.processTokenResponse.bind(this),
        handleTokenRequestError: this.handleTokenRequestError.bind(this),
        validateTokenResponse: this.validateTokenResponse.bind(this),
        generateRequestId: this.generateRequestId.bind(this),
      },
      state,
      code,
    );
  }

  /**
   * Acquires a new OAuth2 token using authorization code flow with PKCE
   *
   * Initiates the OAuth2 authorization flow by:
   * 1. Generating PKCE challenge and state parameters
   * 2. Building authorization URL
   * 3. Displaying URL for user to open in browser
   * 4. Waiting for callback via completeOAuthFlow()
   * 5. Timing out after 5 minutes if no callback received
   *
   * This method does NOT automatically open a browser - the user must manually
   * visit the displayed URL to authorize the application.
   * @returns Promise that resolves when authorization completes or rejects on timeout/error
   * @throws \{AuthenticationError\} When authorization times out (5 minutes) or callback returns error
   * @internal
   * @override
   * @see file:../utils/pkce.ts - PKCE code verifier and challenge generation
   * @see file:../utils/auth-url.ts - Authorization URL building
   */
  protected async acquireToken(): Promise<void> {
    return acquireTokenHelper({
      config: this.config,
      authFlowContext: this.authFlowContext,
      stateExpiryMs: this.STATE_EXPIRY_MS,
      authTimeoutMs: this.AUTH_TIMEOUT_MS,
      stateToProviderMap: OAuth2AuthCodeProvider.stateToProvider,
      providerInstance: this,
    });
  }

  /**
   * Retrieves the provider instance for a given OAuth state parameter
   *
   * Uses O(1) map lookup to find the provider that initiated an OAuth flow.
   * This enables concurrent flows across multiple provider instances where
   * each callback needs to resolve to the correct provider.
   * @param state - OAuth2 state parameter from authorization callback
   * @returns Provider instance that initiated the flow, or undefined if state not found
   * @example
   * ```typescript
   * // In OAuth callback route
   * const state = req.query.state;
   * const provider = OAuth2AuthCodeProvider.getProviderForState(state);
   *
   * if (!provider) {
   *   return res.status(400).send('Invalid OAuth state');
   * }
   *
   * await provider.completeOAuthFlow(state, code);
   * ```
   * @public
   * @see file:./oauth2-authorization-code.ts:161 - completeOAuthFlow usage
   */
  public static getProviderForState(state: string): OAuth2AuthCodeProvider | undefined {
    return OAuth2AuthCodeProvider.stateToProvider.get(state);
  }

  /**
   * Cleans up resources when provider instance is no longer needed
   *
   * Stops the periodic cleanup interval, cancels all pending authorization flows,
   * and unregisters from automatic garbage collection cleanup. Call this method
   * to immediately free resources.
   * @remarks
   * While automatic cleanup occurs during garbage collection via FinalizationRegistry,
   * explicitly calling destroy() is recommended for immediate resource cleanup and
   * to reject any pending authorization flows with a clear error.
   * @example
   * ```typescript
   * const provider = new OAuth2AuthCodeProvider(config, storage);
   *
   * try {
   *   await provider.getHeaders();
   * } finally {
   *   provider.destroy(); // Clean up resources
   * }
   * ```
   * @public
   */
  public destroy(): void {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Unregister from automatic cleanup since we're manually destroying
    cleanupRegistry.unregister(this);

    // Clean up all pending auths for this instance
    cleanupPendingAuth(this.authFlowContext);
  }

  /**
   * Validates that configuration contains all required fields and valid URLs
   *
   * Checks for presence of clientId, authorizationEndpoint, tokenEndpoint, and
   * redirectUri. Also validates that URLs are properly formed.
   * @throws \{AuthenticationError\} When required fields are missing or URLs are invalid
   * @internal
   */
  private validateConfig(): void {
    validateConfigHelper(this.config);
  }
}
