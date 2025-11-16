import type { ClientRegistration } from '@mcp-funnel/models';

/**
 * Checks if a Unix timestamp (seconds since epoch) has passed.
 * @param expiresAt - Unix timestamp in seconds
 * @returns `true` if the current time is at or past the expiration time
 * @internal
 */
function isExpired(expiresAt: number): boolean {
  return Math.floor(Date.now() / 1000) >= expiresAt;
}

/**
 * Validates OAuth 2.0 client credentials according to the client type.
 *
 * Handles three scenarios:
 * - **Public clients**: Must not provide a secret (client.client_secret is undefined)
 * - **Expired secrets**: Returns false if the secret has an expiration timestamp that has passed
 * - **Confidential clients**: Must provide a secret matching the registered client_secret
 * @param client - OAuth client registration containing client_id, optional client_secret, and expiration info
 * @param clientSecret - The client secret provided in the authentication request (optional for public clients)
 * @returns `true` if credentials are valid for the client type, `false` otherwise
 * @example Public client validation
 * ```typescript
 * const publicClient = {
 *   client_id: 'public-app',
 *   redirect_uris: ['http://localhost:3000/callback']
 * };
 * validateClientCredentials(publicClient); // true
 * validateClientCredentials(publicClient, 'some-secret'); // false - public clients must not have secrets
 * ```
 * @example Confidential client validation
 * ```typescript
 * const confidentialClient = {
 *   client_id: 'confidential-app',
 *   client_secret: 'registered-secret',
 *   redirect_uris: ['https://app.example.com/callback']
 * };
 * validateClientCredentials(confidentialClient, 'registered-secret'); // true
 * validateClientCredentials(confidentialClient, 'wrong-secret'); // false
 * ```
 * @public
 * @see file:../../provider/token-utils/handleAuthorizationCodeGrant.ts:49 - Usage in authorization code flow
 * @see file:../../provider/token-utils/handleRefreshTokenGrant.ts:46 - Usage in refresh token flow
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
