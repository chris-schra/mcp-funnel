/**
 * OAuth error handling utilities
 */

import { parseErrorResponse } from './parse-error-response.js';
import { createOAuth2Error } from './create-oauth2-error.js';
import { isRetryableError } from './is-retryable-error.js';

export class OAuthErrorUtils {
  public static parseErrorResponse = parseErrorResponse;
  public static createOAuth2Error = createOAuth2Error;
  public static isRetryableError = isRetryableError;
}

// Re-export individual functions for direct import
export { parseErrorResponse } from './parse-error-response.js';
export { createOAuth2Error } from './create-oauth2-error.js';
export { isRetryableError } from './is-retryable-error.js';
