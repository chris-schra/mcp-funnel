import {
  AuthenticationError,
  OAuth2ErrorCode,
} from '../errors/authentication-error.js';
import {
  type ITokenStorage,
  logEvent,
  type TokenData,
  ValidationUtils,
} from '@mcp-funnel/core';
import type { OAuth2TokenResponse } from '../utils/oauth-types.js';
import { BaseOAuthProvider } from './base-oauth-provider.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import { resolveOAuth2AuthCodeConfig } from '../utils/oauth-utils.js';
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from '../utils/pkce.js';
import {
  type AuthFlowContext,
  cleanupExpiredStates,
  cleanupPendingAuth,
  type PendingAuth,
} from '../utils/auth-flow.js';
import { buildAuthorizationUrl } from '../utils/auth-url.js';
import {
  buildTokenExchangeBody,
  buildTokenExchangeHeaders,
} from '../utils/token-exchange.js';

/**
 * Cleanup registry for automatic resource cleanup when OAuth providers are garbage collected
 * This prevents memory leaks when destroy() is not called manually
 */
const cleanupRegistry = new FinalizationRegistry<NodeJS.Timeout>(
  (intervalId) => {
    clearInterval(intervalId);
  },
);

/**
 * OAuth2 Authorization Code provider implementing IAuthProvider
 *
 * Implements OAuth2 Authorization Code flow (RFC 6749 Section 4.1) with PKCE (RFC 7636):
 * - User browser-based authorization with PKCE security
 * - Token acquisition and automatic refresh
 * - Secure state management and validation
 * - Integration with existing Hono server callback route
 * - Automatic cleanup of intervals when instance is garbage collected
 *
 * **Important**: While automatic cleanup is provided via FinalizationRegistry,
 * it's recommended to explicitly call destroy() for immediate resource cleanup.
 */
export class OAuth2AuthCodeProvider extends BaseOAuthProvider {
  private readonly config: OAuth2AuthCodeConfig;
  private readonly authFlowContext: AuthFlowContext;
  private readonly cleanupInterval: NodeJS.Timeout;

  // Global state-to-provider mapping for O(1) lookup across all instances
  private static stateToProvider = new Map<string, OAuth2AuthCodeProvider>();

  private readonly AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

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
        cleanupExpiredStates(
          this.authFlowContext,
          this.STATE_EXPIRY_MS,
          (state) => {
            logEvent('info', 'auth:oauth_state_expired', { state });
          },
        );
      },
      2 * 60 * 1000,
    );

    // Register for automatic cleanup when instance is garbage collected
    // This prevents memory leaks if destroy() is not called manually
    cleanupRegistry.register(this, this.cleanupInterval);
  }

  /**
   * Ensures a valid token is available, acquiring one if necessary
   * Overridden for Auth Code flow to avoid proactive refresh scheduling
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
   * Complete OAuth flow with authorization code from callback
   * Called by Hono server callback route
   * Now supports concurrent flows using state-based lookup
   */
  public async completeOAuthFlow(state: string, code: string): Promise<void> {
    const pending = this.authFlowContext.pendingAuthFlows.get(state);
    if (!pending) {
      throw new AuthenticationError(
        'Invalid or expired OAuth state',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    try {
      const tokenResponse = await this.exchangeCodeForTokenResponse(
        code,
        pending.codeVerifier,
      );

      const requestId = this.generateRequestId();
      await this.processTokenResponse(tokenResponse, requestId);

      // Get the stored token to pass to the resolver
      const tokenData = await this.storage.retrieve();
      if (!tokenData) {
        throw new AuthenticationError(
          'Failed to retrieve stored token after OAuth flow completion',
          OAuth2ErrorCode.INVALID_REQUEST,
        );
      }

      logEvent('info', 'auth:oauth_flow_completed', {
        expiresAt: tokenData.expiresAt.toISOString(),
        scope: tokenData.scope,
      });

      pending.resolve(tokenData);
    } catch (error) {
      pending.reject(error as Error);
    } finally {
      // Clean up this specific state
      cleanupPendingAuth(this.authFlowContext, state);
    }
  }

  /**
   * Acquires a new OAuth2 token using authorization code flow
   */
  protected async acquireToken(): Promise<void> {
    return new Promise((resolve, reject) => {
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Set up pending auth state with expiry tracking
      const timeout = setTimeout(() => {
        cleanupPendingAuth(this.authFlowContext, state);
        reject(
          new AuthenticationError(
            'Authorization timeout - please try again',
            OAuth2ErrorCode.ACCESS_DENIED,
          ),
        );
      }, this.AUTH_TIMEOUT_MS);

      const pendingAuth: PendingAuth = {
        state,
        codeVerifier,
        resolve: (_token: TokenData) => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
        timestamp: Date.now(),
      };

      // Store in concurrent flow maps
      this.authFlowContext.pendingAuthFlows.set(state, pendingAuth);
      OAuth2AuthCodeProvider.stateToProvider.set(state, this);

      // Build authorization URL with PKCE
      const authUrl = buildAuthorizationUrl({
        config: this.config,
        state,
        codeChallenge,
      });

      logEvent('info', 'auth:oauth_flow_initiated', {
        authUrl: this.config.authorizationEndpoint,
        redirectUri: this.config.redirectUri,
        scope: this.config.scope,
      });

      // Log URL for user to open (following protocol - NO browser launch package)
      console.info('\n🔐 Please open this URL in your browser to authorize:');
      console.info(authUrl.toString());
      console.info('\nWaiting for authorization callback...');
      console.info(`Timeout in ${this.AUTH_TIMEOUT_MS / 1000} seconds\n`);

      // Also log structured event for monitoring
      logEvent('info', 'auth:oauth_authorization_required', {
        authUrl: authUrl.toString(),
        timeout: this.AUTH_TIMEOUT_MS / 1000,
      });
    });
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForTokenResponse(
    code: string,
    codeVerifier: string,
  ): Promise<OAuth2TokenResponse> {
    const body = buildTokenExchangeBody({
      config: this.config,
      code,
      codeVerifier,
    });

    const headers = buildTokenExchangeHeaders(this.config);

    try {
      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers,
        body: body.toString(),
      });

      if (!response.ok) {
        await this.handleTokenRequestError(undefined, response);
      }

      const tokenResponse = (await response.json()) as OAuth2TokenResponse;

      this.validateTokenResponse(tokenResponse);

      return tokenResponse;
    } catch (error) {
      // handleTokenRequestError always throws, execution never continues past this point
      return await this.handleTokenRequestError(error);
    }
  }

  /**
   * Static method to get provider for a given state (O(1) lookup)
   */
  public static getProviderForState(
    state: string,
  ): OAuth2AuthCodeProvider | undefined {
    return OAuth2AuthCodeProvider.stateToProvider.get(state);
  }

  /**
   * Cleanup resources when provider is destroyed
   *
   * **Important**: Call this method when you're done with the provider instance
   * to immediately free resources. If not called, automatic cleanup will occur
   * during garbage collection, but may be delayed.
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
   * Validates the configuration has required fields
   */
  private validateConfig(): void {
    try {
      // Validate required fields
      ValidationUtils.validateRequired(
        this.config,
        ['clientId', 'authorizationEndpoint', 'tokenEndpoint', 'redirectUri'],
        'OAuth2 Authorization Code config',
      );

      // Validate URL formats
      ValidationUtils.validateOAuthUrls(this.config);
    } catch (error) {
      throw new AuthenticationError(
        error instanceof Error
          ? error.message
          : 'Configuration validation failed',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }
  }
}
