import {
  AuthenticationError,
  OAuth2ErrorCode,
  AuthErrorCode,
} from '../errors/authentication-error.js';
import type { TokenData } from '../index.js';
import type {
  OAuth2TokenResponse,
  OAuth2ErrorResponse,
} from './oauth-types.js';
import { DEFAULT_EXPIRY_SECONDS } from './oauth-types.js';
import type { OAuth2ClientCredentialsConfigZod } from '../../config.js';
import type { OAuth2AuthCodeConfig } from '../../types/auth.types.js';
import {
  EnvironmentResolver,
  resolveEnvironmentVariables as resolveEnv,
} from '../implementations/environment-resolver.js';

/**
 * Resolves environment variables in configuration
 * @param config Configuration object with potential environment variables
 * @param fields Fields to check and resolve
 * @param envSource Optional custom environment source
 */
export function resolveEnvironmentVariables<
  T extends Record<string, string | undefined>,
>(
  config: T,
  fields: (keyof T)[],
  envSource?: Record<string, string | undefined>,
): T {
  const resolved = { ...config };

  for (const field of fields) {
    const value = config[field];
    if (typeof value === 'string') {
      try {
        resolved[field] = (
          EnvironmentResolver.containsVariables(value)
            ? resolveEnv(value, { envSource })
            : value
        ) as T[keyof T];
      } catch (error) {
        throw new AuthenticationError(
          error instanceof Error
            ? error.message
            : 'Environment variable resolution failed',
          OAuth2ErrorCode.INVALID_REQUEST,
        );
      }
    }
  }

  return resolved;
}

/**
 * Specific resolver for OAuth2 Client Credentials config
 */
export function resolveOAuth2ClientCredentialsConfig(
  config: OAuth2ClientCredentialsConfigZod,
): OAuth2ClientCredentialsConfigZod {
  return {
    ...config,
    clientId: resolveEnvVar(config.clientId),
    clientSecret: resolveEnvVar(config.clientSecret),
    tokenEndpoint: resolveEnvVar(config.tokenEndpoint),
    scope: config.scope ? resolveEnvVar(config.scope) : config.scope,
    audience: config.audience
      ? resolveEnvVar(config.audience)
      : config.audience,
  };
}

/**
 * Specific resolver for OAuth2 Authorization Code config
 */
export function resolveOAuth2AuthCodeConfig(
  config: OAuth2AuthCodeConfig,
): OAuth2AuthCodeConfig {
  return {
    ...config,
    clientId: resolveEnvVar(config.clientId),
    clientSecret: config.clientSecret
      ? resolveEnvVar(config.clientSecret)
      : config.clientSecret,
    authorizationEndpoint: resolveEnvVar(config.authorizationEndpoint),
    tokenEndpoint: resolveEnvVar(config.tokenEndpoint),
    redirectUri: resolveEnvVar(config.redirectUri),
    scope: config.scope ? resolveEnvVar(config.scope) : config.scope,
    audience: config.audience
      ? resolveEnvVar(config.audience)
      : config.audience,
  };
}

/**
 * Resolves a single environment variable reference
 */
export function resolveEnvVar(value: string): string {
  try {
    return EnvironmentResolver.containsVariables(value)
      ? resolveEnv(value)
      : value;
  } catch (error) {
    throw new AuthenticationError(
      error instanceof Error
        ? error.message
        : 'Environment variable resolution failed',
      OAuth2ErrorCode.INVALID_REQUEST,
    );
  }
}

/**
 * Parses error response from OAuth2 server
 */
export async function parseErrorResponse(
  response: Response,
): Promise<OAuth2ErrorResponse> {
  try {
    const errorData = await response.json();
    return errorData as OAuth2ErrorResponse;
  } catch {
    // If JSON parsing fails, return generic error based on status
    return {
      error: response.status >= 500 ? 'server_error' : 'invalid_request',
      error_description: `HTTP ${response.status}: ${response.statusText}`,
    };
  }
}

/**
 * Creates appropriate AuthenticationError from OAuth2 error response
 */
export function createOAuth2Error(
  errorResponse: OAuth2ErrorResponse,
  statusCode: number,
): AuthenticationError {
  const message = errorResponse.error_description
    ? `OAuth2 authentication failed: ${errorResponse.error} - ${errorResponse.error_description}`
    : `OAuth2 authentication failed: ${errorResponse.error}`;

  // Map OAuth2 error codes to our error codes
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
    case 'unsupported_response_type':
      errorCode = OAuth2ErrorCode.UNSUPPORTED_RESPONSE_TYPE;
      break;
    case 'server_error':
      errorCode = OAuth2ErrorCode.SERVER_ERROR;
      break;
    case 'temporarily_unavailable':
      errorCode = OAuth2ErrorCode.TEMPORARILY_UNAVAILABLE;
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
export function parseTokenResponse(
  tokenResponse: OAuth2TokenResponse,
  defaultExpirySeconds: number = DEFAULT_EXPIRY_SECONDS,
): TokenData {
  const expiresIn = tokenResponse.expires_in ?? defaultExpirySeconds;
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
 * Determines if an error is retryable (network errors, not OAuth2 errors)
 */
export function isRetryableError(error: Error): boolean {
  // Network errors that might be transient
  const retryableNetworkErrors = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ENETUNREACH',
    'ECONNABORTED',
  ];

  const errorMessage = error.message.toLowerCase();

  // Check for specific network error codes
  if (
    retryableNetworkErrors.some((code) =>
      errorMessage.includes(code.toLowerCase()),
    )
  ) {
    return true;
  }

  // Check for generic network timeout/reset messages
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('reset') ||
    errorMessage.includes('connection')
  ) {
    return true;
  }

  // Don't retry OAuth2 authentication errors
  if (error instanceof AuthenticationError) {
    return false;
  }

  return false;
}

/**
 * Extracts the token from a Bearer authorization header
 * @param authHeader - The Authorization header value (e.g., 'Bearer token123')
 * @returns The extracted token or null if not a Bearer token
 */
export function extractBearerToken(authHeader: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.replace('Bearer ', '');
}
