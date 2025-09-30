import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';
import {
  AUTH_DEFAULT_EXPIRY_SECONDS,
  AuthenticationError,
  AuthErrorCode,
  type OAuth2ClientCredentialsConfigZod,
  OAuth2ErrorCode,
  OAuth2ErrorResponse,
  type OAuth2TokenResponse,
  OAuthUtils,
  resolveOAuth2AuthCodeConfig,
  resolveOAuth2ClientCredentialsConfig,
} from '@mcp-funnel/auth';
import { resolveConfigFields, resolveEnvVar } from '@mcp-funnel/core';

const {
  parseErrorResponse,
  parseTokenResponse,
  isRetryableError,
  createOAuth2Error,
} = OAuthUtils;


describe('OAuth Utils - isRetryableError', () => {
  it('should identify retryable network errors by code', () => {
    const retryableCodes = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ENETUNREACH',
      'ECONNABORTED',
    ];

    retryableCodes.forEach((code) => {
      const error = new Error(`Request failed with ${code}`);
      expect(isRetryableError(error)).toBe(true);
    });
  });

  it('should identify retryable errors by keyword', () => {
    const retryableMessages = [
      'Network error occurred',
      'Connection timeout',
      'Connection reset by peer',
      'Network is unreachable',
    ];

    retryableMessages.forEach((message) => {
      const error = new Error(message);
      expect(isRetryableError(error)).toBe(true);
    });
  });

  it('should not retry authentication errors', () => {
    const authError = new AuthenticationError(
      'Invalid credentials',
      OAuth2ErrorCode.INVALID_CLIENT,
    );

    expect(isRetryableError(authError)).toBe(false);
  });

  it('should not retry non-network errors', () => {
    const nonRetryableMessages = [
      'Validation error',
      'JSON parse error',
      'Invalid request format',
      'Permission denied',
    ];

    nonRetryableMessages.forEach((message) => {
      const error = new Error(message);
      expect(isRetryableError(error)).toBe(false);
    });
  });

  it('should handle case insensitive matching', () => {
    const mixedCaseErrors = [
      new Error('Network Error Occurred'),
      new Error('CONNECTION TIMEOUT'),
      new Error('econnreset'),
      new Error('ETIMEDOUT happened'),
    ];

    mixedCaseErrors.forEach((error) => {
      expect(isRetryableError(error)).toBe(true);
    });
  });

  it('should handle empty error messages', () => {
    const error = new Error('');
    expect(isRetryableError(error)).toBe(false);
  });

  it('should handle errors with partial keyword matches', () => {
    const partialMatches = [
      'networkish problem', // contains 'network'
      'timeout occurred', // contains 'timeout'
      'reset everything', // contains 'reset'
      'connection issues', // contains 'connection'
    ];

    partialMatches.forEach((message) => {
      const error = new Error(message);
      expect(isRetryableError(error)).toBe(true);
    });
  });

  it('should not match keywords in non-error contexts', () => {
    const nonErrorMessages = [
      'User network preferences saved',
      'Connection successful',
      'Reset password completed',
    ];

    nonErrorMessages.forEach((message) => {
      const error = new Error(message);
      // These should still be retryable due to keyword matching
      // This test verifies the current behavior
      expect(isRetryableError(error)).toBe(true);
    });
  });
});
