import {
  type OAuthError,
  OAuthErrorCodes,
  type TokenRequest,
} from '@mcp-funnel/models';

/**
 * Validates OAuth 2.0 token request parameters according to RFC 6749.
 *
 * Performs comprehensive validation including:
 * - Required parameters (grant_type, client_id)
 * - Grant type support (authorization_code, refresh_token)
 * - Grant-specific parameters (code/redirect_uri for authorization_code, refresh_token for refresh_token)
 * @param params - Partial token request parameters to validate
 * @returns Validation result with success flag and optional error details
 * @example
 * ```typescript
 * // Authorization code flow
 * const result = validateTokenRequest({
 *   grant_type: 'authorization_code',
 *   client_id: 'my-client',
 *   code: 'auth-code-123',
 *   redirect_uri: 'http://localhost:3000/callback'
 * });
 * if (!result.valid) {
 *   console.error(result.error?.error_description);
 * }
 * ```
 * @example
 * ```typescript
 * // Refresh token flow
 * const result = validateTokenRequest({
 *   grant_type: 'refresh_token',
 *   client_id: 'my-client',
 *   refresh_token: 'refresh-token-xyz'
 * });
 * ```
 * @see file:./validateAuthorizationRequest.ts - Related authorization request validation
 * @see file:../oauth-provider.ts:206 - Usage in token endpoint
 * @public
 */
export function validateTokenRequest(params: Partial<TokenRequest>): {
  valid: boolean;
  error?: OAuthError;
} {
  // Check required parameters
  if (!params.grant_type) {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.INVALID_REQUEST,
        error_description: 'Missing required parameter: grant_type',
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

  // Validate based on grant type
  if (params.grant_type === 'authorization_code') {
    if (!params.code) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'Missing required parameter: code',
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
  } else if (params.grant_type === 'refresh_token') {
    if (!params.refresh_token) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_REQUEST,
          error_description: 'Missing required parameter: refresh_token',
        },
      };
    }
  } else {
    return {
      valid: false,
      error: {
        error: OAuthErrorCodes.UNSUPPORTED_GRANT_TYPE,
        error_description: `Unsupported grant type: ${params.grant_type}`,
      },
    };
  }

  return { valid: true };
}
