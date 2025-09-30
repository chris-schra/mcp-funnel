import { describe, it, expect } from 'vitest';

import {
  AuthenticationError,
  AuthErrorCode,
  OAuth2ErrorCode,
  OAuth2ErrorResponse,
  OAuthUtils,
} from '@mcp-funnel/auth';

const { createOAuth2Error } = OAuthUtils;

describe('OAuth Utils - createOAuth2Error', () => {
  it('should create error for invalid_request', () => {
    const errorResponse: OAuth2ErrorResponse = {
      error: 'invalid_request',
      error_description: 'Missing required parameter',
    };

    const result = createOAuth2Error(errorResponse, 400);

    expect(result).toBeInstanceOf(AuthenticationError);
    expect(result.message).toBe(
      'OAuth2 authentication failed: invalid_request - Missing required parameter',
    );
    expect(result.code).toBe(OAuth2ErrorCode.INVALID_REQUEST);
  });

  it('should create error without description', () => {
    const errorResponse: OAuth2ErrorResponse = {
      error: 'invalid_client',
    };

    const result = createOAuth2Error(errorResponse, 401);

    expect(result.message).toBe('OAuth2 authentication failed: invalid_client');
    expect(result.code).toBe(OAuth2ErrorCode.INVALID_CLIENT);
  });

  it('should map all OAuth2 error codes correctly', () => {
    const testCases: Array<{
      error: string;
      expectedCode: OAuth2ErrorCode;
    }> = [
      {
        error: 'invalid_request',
        expectedCode: OAuth2ErrorCode.INVALID_REQUEST,
      },
      {
        error: 'invalid_client',
        expectedCode: OAuth2ErrorCode.INVALID_CLIENT,
      },
      { error: 'invalid_grant', expectedCode: OAuth2ErrorCode.INVALID_GRANT },
      {
        error: 'unauthorized_client',
        expectedCode: OAuth2ErrorCode.UNAUTHORIZED_CLIENT,
      },
      {
        error: 'unsupported_grant_type',
        expectedCode: OAuth2ErrorCode.UNSUPPORTED_GRANT_TYPE,
      },
      { error: 'invalid_scope', expectedCode: OAuth2ErrorCode.INVALID_SCOPE },
      { error: 'access_denied', expectedCode: OAuth2ErrorCode.ACCESS_DENIED },
      {
        error: 'unsupported_response_type',
        expectedCode: OAuth2ErrorCode.UNSUPPORTED_RESPONSE_TYPE,
      },
      { error: 'server_error', expectedCode: OAuth2ErrorCode.SERVER_ERROR },
      {
        error: 'temporarily_unavailable',
        expectedCode: OAuth2ErrorCode.TEMPORARILY_UNAVAILABLE,
      },
    ];

    testCases.forEach(({ error, expectedCode }) => {
      const errorResponse: OAuth2ErrorResponse = { error };
      const result = createOAuth2Error(errorResponse, 400);

      expect(result.code).toBe(expectedCode);
    });
  });

  it('should handle unknown error with 5xx status', () => {
    const errorResponse: OAuth2ErrorResponse = {
      error: 'unknown_error',
    };

    const result = createOAuth2Error(errorResponse, 500);

    expect(result.code).toBe(OAuth2ErrorCode.SERVER_ERROR);
  });

  it('should handle unknown error with 4xx status', () => {
    const errorResponse: OAuth2ErrorResponse = {
      error: 'unknown_error',
    };

    const result = createOAuth2Error(errorResponse, 400);

    expect(result.code).toBe(AuthErrorCode.UNKNOWN_ERROR);
  });
});
