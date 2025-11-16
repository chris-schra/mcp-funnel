/**
 * Tests for OAuth response utility functions
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../../utils/index.js';

const { createOAuthErrorResponse, createTokenResponse } = OAuthUtils;

describe('Response Utilities', () => {
  it('should create OAuth error response', () => {
    const error = {
      error: 'invalid_request',
      error_description: 'Missing parameter',
    };

    const response = createOAuthErrorResponse(error);

    expect(response.status).toBe(400);
    expect(response.headers['Content-Type']).toBe('application/json');
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.headers['Pragma']).toBe('no-cache');
    expect(response.body).toEqual(error);
  });

  it('should create OAuth error response with custom status', () => {
    const error = {
      error: 'server_error',
      error_description: 'Internal error',
    };

    const response = createOAuthErrorResponse(error, 500);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(error);
  });

  it('should create token response', () => {
    const tokenData = {
      access_token: 'access-token-123',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    const response = createTokenResponse(tokenData);

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/json');
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.headers['Pragma']).toBe('no-cache');
    expect(response.body).toEqual(tokenData);
  });
});
