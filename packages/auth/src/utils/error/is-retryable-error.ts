import { AuthenticationError } from '../../errors/authentication-error.js';

/**
 * Determines if an error is retryable (network errors, not OAuth2 errors).
 *
 * Network errors like connection timeouts and resets are considered retryable,
 * while OAuth2 protocol errors (AuthenticationError instances) are not.
 * @param error - The error to check for retry eligibility
 * @returns True if the error is a transient network error that can be retried, false for OAuth2 errors or other failures
 * @see file:../../implementations/base-oauth-provider.ts:191 - Retry logic implementation
 * @public
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
  if (retryableNetworkErrors.some((code) => errorMessage.includes(code.toLowerCase()))) {
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
