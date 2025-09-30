import type { ClientRegistration } from '@mcp-funnel/models';

/**
 * Check if a timestamp is expired
 */
function isExpired(expiresAt: number): boolean {
  return Math.floor(Date.now() / 1000) >= expiresAt;
}

/**
 * Validate client credentials
 */
export function validateClientCredentials(
  client: ClientRegistration,
  clientSecret?: string,
): boolean {
  // Public clients don't have secrets
  if (!client.client_secret) {
    return !clientSecret;
  }

  if (
    typeof client.client_secret_expires_at === 'number' &&
    client.client_secret_expires_at > 0 &&
    isExpired(client.client_secret_expires_at)
  ) {
    return false;
  }

  // Confidential clients must provide correct secret
  return client.client_secret === clientSecret;
}
