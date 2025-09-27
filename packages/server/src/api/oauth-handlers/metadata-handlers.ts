/**
 * OAuth metadata and utility endpoint handlers
 */

import type { OAuthProvider } from '../../oauth/oauth-provider.js';
import type { Context } from 'hono';

/**
 * Handle OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * GET /.well-known/oauth-authorization-server
 */
export async function handleMetadataRequest(
  c: Context,
  oauthProvider: OAuthProvider,
) {
  const metadata = oauthProvider.getMetadata();
  return c.json(metadata);
}
