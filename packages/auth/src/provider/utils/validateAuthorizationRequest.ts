import {
  type AuthorizationRequest,
  CodeChallengeMethods,
  type OAuthError,
  OAuthErrorCodes,
} from '@mcp-funnel/models';

/**
 * Validates OAuth 2.0 authorization request parameters according to RFC 6749.
 *
 * Performs comprehensive validation including:
 * - Required parameters (response_type, client_id, redirect_uri)
 * - Response type support (only 'code' flow)
 * - Redirect URI format (must be valid URL)
 * - PKCE parameters consistency (code_challenge_method required when code_challenge present)
 * @param params - Partial authorization request parameters to validate
 * @returns Validation result with success flag and optional error details
 * @example
 * ```typescript
 * const result = validateAuthorizationRequest({
 *   response_type: 'code',
 *   client_id: 'my-client',
 *   redirect_uri: 'http://localhost:3000/callback'
 * });
 * if (!result.valid) {
 *   console.error(result.error?.error_description);
 * }
 * ```
 * @see file:./validateTokenRequest.ts - Related token request validation
 * @public
 */
export function validateAuthorizationRequest(params: Partial<AuthorizationRequest>): {
  valid: boolean;
  error?: OAuthError;
} {
  // Check required parameters
  if (!params.response_type) {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Missing required parameter: response_type',
      },
    };
  }

  if (!params.client_id) {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Missing required parameter: client_id',
      },
    };
  }

  if (!params.redirect_uri) {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Missing required parameter: redirect_uri',
      },
    };
  }

  // Validate response_type
  if (params.response_type !== 'code') {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE,
        error_description: 'Only authorization code flow is supported',
      },
    };
  }

  // Validate redirect_uri format
  try {
    new URL(params.redirect_uri);
  } catch {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Invalid redirect_uri format',
      },
    };
  }

  // Validate PKCE parameters if present
  if (params.code_challenge) {
    if (!params.code_challenge_method) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'code_challenge_method is required when code_challenge is present',
        },
      };
    }

    if (
      params.code_challenge_method !== CodeChallengeMethods.PLAIN &&
      params.code_challenge_method !== CodeChallengeMethods.S256
    ) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'Invalid code_challenge_method',
        },
      };
    }
  }

  return { valid: true };
}
