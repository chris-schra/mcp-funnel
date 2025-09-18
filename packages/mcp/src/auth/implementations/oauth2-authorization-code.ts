import { randomBytes, createHash } from 'crypto';
import type { ITokenStorage, TokenData } from '../index.js';
import type { OAuth2AuthCodeConfig } from '../../types/auth.types.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
} from '../errors/authentication-error.js';
import { logEvent } from '../../logger.js';
import type { OAuth2TokenResponse } from '../utils/oauth-types.js';
import { resolveOAuth2AuthCodeConfig } from '../utils/oauth-utils.js';
import { BaseOAuthProvider } from './base-oauth-provider.js';

/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth2 Authorization Code flow
 */
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return base64URLEncode(hash);
}

function generateState(): string {
  return base64URLEncode(randomBytes(16));
}

/**
 * Pending authorization state with timestamp for expiration tracking
 */
interface PendingAuth {
  state: string;
  codeVerifier: string;
  resolve: (token: TokenData) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  timestamp: number;
}

/**
 * OAuth2 Authorization Code provider implementing IAuthProvider
 *
 * Implements OAuth2 Authorization Code flow (RFC 6749 Section 4.1) with PKCE (RFC 7636):
 * - User browser-based authorization with PKCE security
 * - Token acquisition and automatic refresh
 * - Secure state management and validation
 * - Integration with existing Hono server callback route
 */
export class OAuth2AuthCodeProvider extends BaseOAuthProvider {
  private readonly config: OAuth2AuthCodeConfig;

  // Support concurrent OAuth flows with Map keyed by state
  private pendingAuthFlows = new Map<string, PendingAuth>();

  // Global state-to-provider mapping for O(1) lookup across all instances
  private static stateToProvider = new Map<string, OAuth2AuthCodeProvider>();

  private readonly AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

  // Cleanup interval for expired states
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: OAuth2AuthCodeConfig, storage: ITokenStorage) {
    super(storage);
    this.config = resolveOAuth2AuthCodeConfig(config);
    this.validateConfig();

    // Start periodic cleanup of expired states (every 2 minutes)
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredStates();
      },
      2 * 60 * 1000,
    );
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
  async completeOAuthFlow(state: string, code: string): Promise<void> {
    const pending = this.pendingAuthFlows.get(state);
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
      this.cleanupPendingAuth(state);
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
        this.cleanupPendingAuth(state);
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
      this.pendingAuthFlows.set(state, pendingAuth);
      OAuth2AuthCodeProvider.stateToProvider.set(state, this);

      // Build authorization URL with PKCE
      const authUrl = new URL(this.config.authorizationEndpoint);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', this.config.clientId);
      authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      if (this.config.scope) {
        authUrl.searchParams.set('scope', this.config.scope);
      }

      if (this.config.audience) {
        authUrl.searchParams.set('audience', this.config.audience);
      }

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
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: codeVerifier,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Add client authentication if client secret is provided
    if (this.config.clientSecret) {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString('base64');
      headers.Authorization = `Basic ${credentials}`;
    }

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
      await this.handleTokenRequestError(error);
      throw new Error('This line should never be reached');
    }
  }

  /**
   * Clean up specific pending authorization state by state key
   */
  private cleanupPendingAuth(state?: string): void {
    if (state) {
      const pending = this.pendingAuthFlows.get(state);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingAuthFlows.delete(state);
        OAuth2AuthCodeProvider.stateToProvider.delete(state);
      }
    } else {
      // Legacy cleanup - clean all pending auths for this instance
      for (const [stateKey, pending] of this.pendingAuthFlows) {
        clearTimeout(pending.timeout);
        OAuth2AuthCodeProvider.stateToProvider.delete(stateKey);
      }
      this.pendingAuthFlows.clear();
    }
  }

  /**
   * Clean up expired states across all instances
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    const expiredStates: string[] = [];

    for (const [state, pending] of this.pendingAuthFlows) {
      if (now - pending.timestamp > this.STATE_EXPIRY_MS) {
        expiredStates.push(state);
      }
    }

    for (const state of expiredStates) {
      logEvent('info', 'auth:oauth_state_expired', { state });
      this.cleanupPendingAuth(state);
    }
  }

  /**
   * Static method to get provider for a given state (O(1) lookup)
   */
  static getProviderForState(
    state: string,
  ): OAuth2AuthCodeProvider | undefined {
    return OAuth2AuthCodeProvider.stateToProvider.get(state);
  }

  /**
   * Cleanup resources when provider is destroyed
   */
  destroy(): void {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clean up all pending auths for this instance
    this.cleanupPendingAuth();
  }

  /**
   * Validates the configuration has required fields
   */
  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new AuthenticationError(
        'OAuth2 client ID is required',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    if (!this.config.authorizationEndpoint) {
      throw new AuthenticationError(
        'OAuth2 authorization URL is required',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    if (!this.config.tokenEndpoint) {
      throw new AuthenticationError(
        'OAuth2 token URL is required',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    if (!this.config.redirectUri) {
      throw new AuthenticationError(
        'OAuth2 redirect URI is required',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    // Validate URL formats
    try {
      new URL(this.config.authorizationEndpoint);
      new URL(this.config.tokenEndpoint);
      new URL(this.config.redirectUri);
    } catch {
      throw new AuthenticationError(
        'OAuth2 URLs must be valid URLs',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }
  }
}
