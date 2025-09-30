import { createHash } from 'node:crypto';
import { CodeChallengeMethods } from '@mcp-funnel/models';

/**
 * Validate PKCE code verifier against challenge
 */
export function validatePkceChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): boolean {
  if (method === CodeChallengeMethods.PLAIN) {
    return codeVerifier === codeChallenge;
  }

  if (method === CodeChallengeMethods.S256) {
    const hash = createHash('sha256').update(codeVerifier).digest('base64url');
    return hash === codeChallenge;
  }

  return false;
}
