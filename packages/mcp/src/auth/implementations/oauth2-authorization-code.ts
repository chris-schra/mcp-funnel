import { randomBytes, createHash } from 'crypto';
import type { IAuthProvider, ITokenStorage, TokenData } from '../index.js';
import type { OAuth2AuthCodeConfig } from '../../types/auth.types.js';
import {
  AuthenticationError,
  OAuth2ErrorCode,
  AuthErrorCode,
} from '../errors/authentication-error.js';
import { logEvent } from '../../logger.js';

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
 * OAuth2 token response interface following RFC 6749
 */
interface OAuth2TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * OAuth2 error response interface following RFC 6749
 */
interface OAuth2ErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Pending authorization state
 */
interface PendingAuth {
  state: string;
  codeVerifier: string;
  resolve: (token: TokenData) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
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
export class OAuth2AuthCodeProvider implements IAuthProvider {
  private readonly config: OAuth2AuthCodeConfig;
  private readonly storage: ITokenStorage;
  private pendingAuth?: PendingAuth;
  private refreshPromise?: Promise<void>;
  private readonly DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour
  private readonly AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(config: OAuth2AuthCodeConfig, storage: ITokenStorage) {
    this.config = this.resolveEnvironmentVariables(config);
    this.storage = storage;
    this.validateConfig();
  }

  /**
   * Returns authentication headers for requests
   */
  async getHeaders(): Promise<Record<string, string>> {
    const token = await this.ensureValidToken();
    return {
      Authorization: `${token.tokenType} ${token.accessToken}`,
    };
  }

  /**
   * Checks if the current authentication state is valid
   */
  async isValid(): Promise<boolean> {
    try {
      const token = await this.storage.retrieve();
      if (!token) {
        return false;
      }
      return !(await this.storage.isExpired());
    } catch (error) {
      logEvent('debug', 'auth:token_validation_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Refresh credentials by acquiring a new token
   */
  async refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.acquireNewToken();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  /**
   * Complete OAuth flow with authorization code from callback
   * Called by Hono server callback route
   */
  async completeOAuthFlow(state: string, code: string): Promise<void> {
    if (!this.pendingAuth) {
      throw new AuthenticationError(
        'No pending authorization found',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    if (this.pendingAuth.state !== state) {
      this.cleanupPendingAuth();
      throw new AuthenticationError(
        'Invalid state parameter',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    try {
      const tokenData = await this.exchangeCodeForToken(
        code,
        this.pendingAuth.codeVerifier,
      );

      await this.storage.store(tokenData);

      logEvent('info', 'auth:oauth_flow_completed', {
        expiresAt: tokenData.expiresAt.toISOString(),
        scope: tokenData.scope,
      });

      this.pendingAuth.resolve(tokenData);
    } catch (error) {
      this.pendingAuth.reject(error as Error);
    } finally {
      this.cleanupPendingAuth();
    }
  }

  /**
   * Ensures a valid token is available, acquiring one if necessary
   */
  private async ensureValidToken(): Promise<TokenData> {
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
        AuthErrorCode.UNKNOWN_ERROR,
      );
    }

    return token;
  }

  /**
   * Acquires a new OAuth2 token using authorization code flow
   */
  private async acquireNewToken(): Promise<void> {
    return new Promise((resolve, reject) => {
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Set up pending auth state
      const timeout = setTimeout(() => {
        this.cleanupPendingAuth();
        reject(
          new AuthenticationError(
            'Authorization timeout - please try again',
            OAuth2ErrorCode.ACCESS_DENIED,
          ),
        );
      }, this.AUTH_TIMEOUT_MS);

      this.pendingAuth = {
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
      };

      // Build authorization URL with PKCE
      const authUrl = new URL(this.config.authUrl);
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
        authUrl: this.config.authUrl,
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
  private async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
  ): Promise<TokenData> {
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
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers,
        body: body.toString(),
      });

      if (!response.ok) {
        const errorResponse = await this.parseErrorResponse(response);
        throw this.createOAuth2Error(errorResponse, response.status);
      }

      const tokenResponse = (await response.json()) as OAuth2TokenResponse;

      if (!tokenResponse.access_token) {
        throw new AuthenticationError(
          'OAuth2 token response missing access_token field',
          OAuth2ErrorCode.INVALID_REQUEST,
        );
      }

      return this.parseTokenResponse(tokenResponse);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      if (error instanceof SyntaxError) {
        throw new AuthenticationError(
          'Failed to parse OAuth2 token response: invalid JSON',
          AuthErrorCode.UNKNOWN_ERROR,
          error,
        );
      }

      throw AuthenticationError.networkError(
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Parses error response from OAuth2 server
   */
  private async parseErrorResponse(
    response: Response,
  ): Promise<OAuth2ErrorResponse> {
    try {
      const errorData = await response.json();
      return errorData as OAuth2ErrorResponse;
    } catch {
      return {
        error: response.status >= 500 ? 'server_error' : 'invalid_request',
        error_description: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  }

  /**
   * Creates appropriate AuthenticationError from OAuth2 error response
   */
  private createOAuth2Error(
    errorResponse: OAuth2ErrorResponse,
    statusCode: number,
  ): AuthenticationError {
    const message = errorResponse.error_description
      ? `OAuth2 authentication failed: ${errorResponse.error} - ${errorResponse.error_description}`
      : `OAuth2 authentication failed: ${errorResponse.error}`;

    let errorCode: OAuth2ErrorCode | AuthErrorCode;

    switch (errorResponse.error) {
      case 'invalid_request':
        errorCode = OAuth2ErrorCode.INVALID_REQUEST;
        break;
      case 'invalid_client':
        errorCode = OAuth2ErrorCode.INVALID_CLIENT;
        break;
      case 'invalid_grant':
        errorCode = OAuth2ErrorCode.INVALID_GRANT;
        break;
      case 'unauthorized_client':
        errorCode = OAuth2ErrorCode.UNAUTHORIZED_CLIENT;
        break;
      case 'unsupported_grant_type':
        errorCode = OAuth2ErrorCode.UNSUPPORTED_GRANT_TYPE;
        break;
      case 'invalid_scope':
        errorCode = OAuth2ErrorCode.INVALID_SCOPE;
        break;
      case 'access_denied':
        errorCode = OAuth2ErrorCode.ACCESS_DENIED;
        break;
      default:
        errorCode =
          statusCode >= 500
            ? OAuth2ErrorCode.SERVER_ERROR
            : AuthErrorCode.UNKNOWN_ERROR;
    }

    return new AuthenticationError(message, errorCode);
  }

  /**
   * Parses OAuth2 token response into TokenData
   */
  private parseTokenResponse(tokenResponse: OAuth2TokenResponse): TokenData {
    const expiresIn = tokenResponse.expires_in ?? this.DEFAULT_EXPIRY_SECONDS;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const tokenType = tokenResponse.token_type ?? 'Bearer';

    return {
      accessToken: tokenResponse.access_token,
      expiresAt,
      tokenType,
      scope: tokenResponse.scope,
    };
  }

  /**
   * Clean up pending authorization state
   */
  private cleanupPendingAuth(): void {
    if (this.pendingAuth) {
      clearTimeout(this.pendingAuth.timeout);
      this.pendingAuth = undefined;
    }
  }

  /**
   * Resolves environment variables in configuration
   */
  private resolveEnvironmentVariables(
    config: OAuth2AuthCodeConfig,
  ): OAuth2AuthCodeConfig {
    return {
      ...config,
      clientId: this.resolveEnvVar(config.clientId),
      clientSecret: config.clientSecret
        ? this.resolveEnvVar(config.clientSecret)
        : config.clientSecret,
      authUrl: this.resolveEnvVar(config.authUrl),
      tokenUrl: this.resolveEnvVar(config.tokenUrl),
      redirectUri: this.resolveEnvVar(config.redirectUri),
      scope: config.scope ? this.resolveEnvVar(config.scope) : config.scope,
      audience: config.audience
        ? this.resolveEnvVar(config.audience)
        : config.audience,
    };
  }

  /**
   * Resolves a single environment variable reference
   */
  private resolveEnvVar(value: string): string {
    const envVarMatch = value.match(/^\$\{([^}]+)\}$/);
    if (envVarMatch) {
      const envVarName = envVarMatch[1];
      const envValue = process.env[envVarName];

      if (envValue === undefined) {
        throw new AuthenticationError(
          `Environment variable ${envVarName} is not set`,
          OAuth2ErrorCode.INVALID_REQUEST,
        );
      }

      return envValue;
    }

    return value;
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

    if (!this.config.authUrl) {
      throw new AuthenticationError(
        'OAuth2 authorization URL is required',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }

    if (!this.config.tokenUrl) {
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
      new URL(this.config.authUrl);
      new URL(this.config.tokenUrl);
      new URL(this.config.redirectUri);
    } catch {
      throw new AuthenticationError(
        'OAuth2 URLs must be valid URLs',
        OAuth2ErrorCode.INVALID_REQUEST,
      );
    }
  }
}
