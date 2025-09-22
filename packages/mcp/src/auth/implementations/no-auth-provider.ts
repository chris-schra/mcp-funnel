/**
 * NoAuthProvider - A no-op authentication provider that provides no authentication
 *
 * This provider is used when no authentication is required for API requests.
 * It always returns empty headers and is always considered valid.
 */

import type { IAuthProvider } from '../interfaces/auth-provider.interface.js';
import { logEvent } from '../../logger.js';

/**
 * Authentication provider that provides no authentication.
 *
 * This provider:
 * - Always returns empty headers (no authentication)
 * - Is always considered valid
 * - Never needs refreshing
 * - Logs provider creation for audit purposes
 *
 * Use this provider when:
 * - Connecting to APIs that don't require authentication
 * - Testing scenarios where auth is not needed
 * - Development environments with open endpoints
 */
export class NoAuthProvider implements IAuthProvider {
  constructor() {
    // Log provider creation for audit/debugging purposes
    logEvent('info', 'auth:provider_created', {
      type: 'NoAuthProvider',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Returns empty headers since no authentication is provided
   * @returns Promise resolving to empty object
   */
  async getHeaders(): Promise<Record<string, string>> {
    // Always return empty headers - no authentication
    return {};
  }

  /**
   * Always returns true since no authentication means always valid
   * @returns Promise resolving to true
   */
  async isValid(): Promise<boolean> {
    // NoAuth is always "valid" since there's nothing to validate
    return true;
  }

  /**
   * No-op refresh method since there's nothing to refresh
   * This method is optional but provided for completeness
   */
  async refresh?(): Promise<void> {
    // No-op: nothing to refresh for no-auth provider
    logEvent('debug', 'auth:refresh_attempted', {
      type: 'NoAuthProvider',
      action: 'noop',
      timestamp: new Date().toISOString(),
    });
  }
}
