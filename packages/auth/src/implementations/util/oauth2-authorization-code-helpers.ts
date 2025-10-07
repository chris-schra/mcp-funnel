/**
 * Helper functions for OAuth2 Authorization Code flow
 *
 * This module contains extracted helper functions to reduce the size of the
 * OAuth2AuthCodeProvider class while maintaining clear separation of concerns.
 */

import { AuthenticationError, OAuth2ErrorCode } from '../../errors/authentication-error.js';
import { type ITokenStorage, logEvent, type TokenData, ValidationUtils } from '@mcp-funnel/core';
import type { OAuth2TokenResponse } from '../../utils/oauth-types.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../../utils/pkce.js';
import {
  type AuthFlowContext,
  cleanupPendingAuth,
  type PendingAuth,
} from '../../utils/auth-flow.js';
import { buildAuthorizationUrl } from '../../utils/auth-url.js';
import { buildTokenExchangeBody, buildTokenExchangeHeaders } from '../../utils/token-exchange.js';

/**
 * Context needed for completing OAuth flow
 */
export interface CompleteOAuthFlowContext {
  authFlowContext: AuthFlowContext;
  config: OAuth2AuthCodeConfig;
  storage: ITokenStorage;
  processTokenResponse: (tokenResponse: OAuth2TokenResponse, requestId: string) => Promise<void>;
  handleTokenRequestError: (error: unknown, response?: Response) => Promise<never>;
  validateTokenResponse: (tokenResponse: OAuth2TokenResponse) => void;
  generateRequestId: () => string;
}

/**
 * Context needed for acquiring a token
 */
export interface AcquireTokenContext {
  config: OAuth2AuthCodeConfig;
  authFlowContext: AuthFlowContext;
  stateExpiryMs: number;
  authTimeoutMs: number;
  stateToProviderMap: Map<string, unknown>;
  providerInstance: unknown;
}

/**
 * Context needed for exchanging authorization code for token
 */
export interface ExchangeCodeContext {
  config: OAuth2AuthCodeConfig;
  handleTokenRequestError: (error: unknown, response?: Response) => Promise<never>;
  validateTokenResponse: (tokenResponse: OAuth2TokenResponse) => void;
}

/**
 * Completes OAuth2 authorization flow with code from callback
 *
 * Called by the HTTP server callback route after user authorizes the application.
 * Supports concurrent flows using state-based lookup for multi-instance scenarios.
 * Exchanges the authorization code for an access token and resolves the pending promise.
 * @param context - Context containing auth flow state, config, and storage
 * @param state - OAuth2 state parameter from callback URL (must match pending flow)
 * @param code - Authorization code from callback URL to exchange for access token
 * @returns Promise that resolves when token exchange completes and token is stored
 * @throws \{AuthenticationError\} When state is invalid/expired or token exchange fails
 * @public
 * @see file:../../utils/auth-flow.ts:32 - State cleanup utilities
 */
export async function completeOAuthFlow(
  context: CompleteOAuthFlowContext,
  state: string,
  code: string,
): Promise<void> {
  const pending = context.authFlowContext.pendingAuthFlows.get(state);
  if (!pending) {
    throw new AuthenticationError(
      'Invalid or expired OAuth state',
      OAuth2ErrorCode.INVALID_REQUEST,
    );
  }

  try {
    const tokenResponse = await exchangeCodeForTokenResponse(
      {
        config: context.config,
        handleTokenRequestError: context.handleTokenRequestError,
        validateTokenResponse: context.validateTokenResponse,
      },
      code,
      pending.codeVerifier,
    );

    const requestId = context.generateRequestId();
    await context.processTokenResponse(tokenResponse, requestId);

    // Get the stored token to pass to the resolver
    const tokenData = await context.storage.retrieve();
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
    cleanupPendingAuth(context.authFlowContext, state);
  }
}

/**
 * Acquires a new OAuth2 token using authorization code flow with PKCE
 *
 * Initiates the OAuth2 authorization flow by:
 * 1. Generating PKCE challenge and state parameters
 * 2. Building authorization URL
 * 3. Displaying URL for user to open in browser
 * 4. Waiting for callback via completeOAuthFlow()
 * 5. Timing out after configured duration if no callback received
 *
 * This function does NOT automatically open a browser - the user must manually
 * visit the displayed URL to authorize the application.
 * @param context - Context containing config, auth flow state, and timing parameters
 * @returns Promise that resolves when authorization completes or rejects on timeout/error
 * @throws \{AuthenticationError\} When authorization times out or callback returns error
 * @public
 * @see file:../../utils/pkce.ts - PKCE code verifier and challenge generation
 * @see file:../../utils/auth-url.ts - Authorization URL building
 */
export async function acquireToken(context: AcquireTokenContext): Promise<void> {
  return new Promise((resolve, reject) => {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Set up pending auth state with expiry tracking
    const timeout = setTimeout(() => {
      cleanupPendingAuth(context.authFlowContext, state);
      reject(
        new AuthenticationError(
          'Authorization timeout - please try again',
          OAuth2ErrorCode.ACCESS_DENIED,
        ),
      );
    }, context.authTimeoutMs);

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
    context.authFlowContext.pendingAuthFlows.set(state, pendingAuth);
    context.stateToProviderMap.set(state, context.providerInstance);

    // Build authorization URL with PKCE
    const authUrl = buildAuthorizationUrl({
      config: context.config,
      state,
      codeChallenge,
    });

    logEvent('info', 'auth:oauth_flow_initiated', {
      authUrl: context.config.authorizationEndpoint,
      redirectUri: context.config.redirectUri,
      scope: context.config.scope,
    });

    // Log URL for user to open (following protocol - NO browser launch package)
    console.info('\n🔐 Please open this URL in your browser to authorize:');
    console.info(authUrl.toString());
    console.info('\nWaiting for authorization callback...');
    console.info(`Timeout in ${context.authTimeoutMs / 1000} seconds\n`);

    // Also log structured event for monitoring
    logEvent('info', 'auth:oauth_authorization_required', {
      authUrl: authUrl.toString(),
      timeout: context.authTimeoutMs / 1000,
    });
  });
}

/**
 * Exchanges authorization code for access token with PKCE verification
 *
 * Makes a POST request to the token endpoint with the authorization code,
 * code verifier (for PKCE), and client credentials. Validates the response
 * contains required fields.
 * @param context - Context containing config and error handling functions
 * @param code - Authorization code received from callback
 * @param codeVerifier - PKCE code verifier matching the challenge sent in authorization request
 * @returns Promise resolving to OAuth2 token response containing access token
 * @throws \{AuthenticationError\} When token exchange fails or response is invalid
 * @public
 * @see file:../../utils/token-exchange.ts - Token exchange request building
 */
export async function exchangeCodeForTokenResponse(
  context: ExchangeCodeContext,
  code: string,
  codeVerifier: string,
): Promise<OAuth2TokenResponse> {
  const body = buildTokenExchangeBody({
    config: context.config,
    code,
    codeVerifier,
  });

  const headers = buildTokenExchangeHeaders(context.config);

  try {
    const response = await fetch(context.config.tokenEndpoint, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!response.ok) {
      await context.handleTokenRequestError(undefined, response);
    }

    const tokenResponse = (await response.json()) as OAuth2TokenResponse;

    context.validateTokenResponse(tokenResponse);

    return tokenResponse;
  } catch (error) {
    // handleTokenRequestError always throws, execution never continues past this point
    return await context.handleTokenRequestError(error);
  }
}

/**
 * Validates that configuration contains all required fields and valid URLs
 *
 * Checks for presence of clientId, authorizationEndpoint, tokenEndpoint, and
 * redirectUri. Also validates that URLs are properly formed.
 * @param config - OAuth2 Authorization Code configuration to validate
 * @throws \{AuthenticationError\} When required fields are missing or URLs are invalid
 * @public
 */
export function validateConfig(config: OAuth2AuthCodeConfig): void {
  try {
    // Validate required fields
    ValidationUtils.validateRequired(
      config,
      ['clientId', 'authorizationEndpoint', 'tokenEndpoint', 'redirectUri'],
      'OAuth2 Authorization Code config',
    );

    // Validate URL formats
    ValidationUtils.validateOAuthUrls(config);
  } catch (error) {
    throw new AuthenticationError(
      error instanceof Error ? error.message : 'Configuration validation failed',
      OAuth2ErrorCode.INVALID_REQUEST,
    );
  }
}
