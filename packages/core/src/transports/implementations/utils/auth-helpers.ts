/**
 * Authentication Helper Utilities
 *
 * Shared helper functions for handling authentication in client transports.
 *
 * @internal
 */

import type { IAuthProvider } from '../../../auth/index.js';
import { TransportError } from '../../errors/transport-error.js';
import { logEvent } from '../../../logger.js';

/**
 * Gets authentication headers from the configured auth provider.
 * @param authProvider - Auth provider (optional)
 * @param logPrefix - Log prefix for events
 * @returns Auth headers object (empty if no provider configured)
 * @throws \{TransportError\} When authentication fails
 * @internal
 */
export async function getAuthHeaders(
  authProvider: IAuthProvider | undefined,
  logPrefix: string,
): Promise<Record<string, string>> {
  if (!authProvider) {
    return {};
  }

  try {
    return await authProvider.getHeaders();
  } catch (error) {
    logEvent('error', `${logPrefix}:auth-error`, {
      error: String(error),
    });
    throw TransportError.connectionFailed(
      `Authentication failed: ${error}`,
      error as Error,
    );
  }
}
