/**
 * Tests for OAuth token request validation
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../../utils/index.js';
import { OAuthErrorCodes } from '@mcp-funnel/models';

const { validateTokenRequest } = OAuthUtils;

describe('Token Request Validation', () => {
  it('should validate valid authorization code grant', () => {
    const params = {
      grant_type: 'authorization_code',
      code: 'auth-code',
      redirect_uri: 'http://localhost:8080/callback',
      client_id: 'test-client',
    };

    const result = validateTokenRequest(params);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should validate valid refresh token grant', () => {
    const params = {
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token',
      client_id: 'test-client',
    };

    const result = validateTokenRequest(params);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject request missing grant_type', () => {
    const params = {
      code: 'auth-code',
      client_id: 'test-client',
    };

    const result = validateTokenRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('grant_type');
  });

  it('should reject authorization code grant missing code', () => {
    const params = {
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:8080/callback',
      client_id: 'test-client',
    };

    const result = validateTokenRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('code');
  });

  it('should reject refresh token grant missing refresh_token', () => {
    const params = {
      grant_type: 'refresh_token',
      client_id: 'test-client',
    };

    const result = validateTokenRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('refresh_token');
  });

  it('should reject unsupported grant type', () => {
    const params = {
      grant_type: 'client_credentials',
      client_id: 'test-client',
    };

    const result = validateTokenRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.UNSUPPORTED_GRANT_TYPE);
  });
});
