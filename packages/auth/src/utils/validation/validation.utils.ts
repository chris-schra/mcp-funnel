/**
 * OAuth validation utilities
 */

import { validateClientCredentials } from './validate-client-credentials.js';
import { validatePkceChallenge } from './validate-pkce-challenge.js';
import { validateAuthorizationRequest } from '../../provider/utils/validateAuthorizationRequest.js';
import { validateTokenRequest } from '../../provider/utils/validateTokenRequest.js';
import type { ClientRegistration } from '@mcp-funnel/models';

export class OAuthValidationUtils {
  public static validateClientCredentials = validateClientCredentials;
  public static validatePkceChallenge = validatePkceChallenge;
  public static validateAuthorizationRequest = validateAuthorizationRequest;
  public static validateTokenRequest = validateTokenRequest;

  public static validateRedirectUri(
    client: ClientRegistration,
    redirectUri: string,
  ): boolean {
    return client.redirect_uris.includes(redirectUri);
  }

  public static validateScopes(
    requestedScopes: string[],
    supportedScopes: string[],
  ): boolean {
    return requestedScopes.every((scope) => supportedScopes.includes(scope));
  }
}

// Re-export individual functions for direct import
export { validateClientCredentials } from './validate-client-credentials.js';
export { validatePkceChallenge } from './validate-pkce-challenge.js';
export { validateAuthorizationRequest } from '../../provider/utils/validateAuthorizationRequest.js';
export { validateTokenRequest } from '../../provider/utils/validateTokenRequest.js';
