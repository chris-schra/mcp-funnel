/**
 * Tests for OAuth authorization request validation
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../../utils/index.js';
import { OAuthErrorCodes } from '@mcp-funnel/models';

const { validateAuthorizationRequest } = OAuthUtils;

describe('Authorization Request Validation', () => {
  it('should validate valid authorization request', () => {
    const params = {
      response_type: 'code',
      client_id: 'test-client',
      redirect_uri: 'http://localhost:8080/callback',
      scope: 'read write',
      state: 'random-state',
      code_challenge: 'challenge',
      code_challenge_method: 'plain',
    };

    const result = validateAuthorizationRequest(params);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject request missing response_type', () => {
    const params = {
      client_id: 'test-client',
      redirect_uri: 'http://localhost:8080/callback',
    };

    const result = validateAuthorizationRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('response_type');
  });

  it('should reject request missing client_id', () => {
    const params = {
      response_type: 'code',
      redirect_uri: 'http://localhost:8080/callback',
    };

    const result = validateAuthorizationRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('client_id');
  });

  it('should reject request missing redirect_uri', () => {
    const params = {
      response_type: 'code',
      client_id: 'test-client',
    };

    const result = validateAuthorizationRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('redirect_uri');
  });

  it('should reject unsupported response_type', () => {
    const params = {
      response_type: 'token',
      client_id: 'test-client',
      redirect_uri: 'http://localhost:8080/callback',
    };

    const result = validateAuthorizationRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE);
  });

  it('should reject invalid redirect_uri format', () => {
    const params = {
      response_type: 'code',
      client_id: 'test-client',
      redirect_uri: 'not-a-valid-uri',
    };

    const result = validateAuthorizationRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('redirect_uri');
  });

  it('should require code_challenge_method when code_challenge is present', () => {
    const params = {
      response_type: 'code',
      client_id: 'test-client',
      redirect_uri: 'http://localhost:8080/callback',
      code_challenge: 'challenge',
    };

    const result = validateAuthorizationRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('code_challenge_method');
  });

  it('should reject invalid code_challenge_method', () => {
    const params = {
      response_type: 'code',
      client_id: 'test-client',
      redirect_uri: 'http://localhost:8080/callback',
      code_challenge: 'challenge',
      code_challenge_method: 'invalid',
    };

    const result = validateAuthorizationRequest(params);
    expect(result.valid).toBe(false);
    expect(result.error?.error).toBe(OAuthErrorCodes.INVALID_REQUEST);
    expect(result.error?.error_description).toContain('code_challenge_method');
  });
});
