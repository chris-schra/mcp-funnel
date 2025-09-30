import { AuthenticationError } from '../../errors/authentication-error.js';

/**
 * Determines if an error is retryable (network errors, not OAuth2 errors)
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
  if (
    retryableNetworkErrors.some((code) =>
      errorMessage.includes(code.toLowerCase()),
    )
  ) {
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
