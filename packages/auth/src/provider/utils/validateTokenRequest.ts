import {
  type OAuthError,
  OAuthErrorCodes,
  type TokenRequest,
} from '@mcp-funnel/models';

/**
 * Validate token request parameters
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
