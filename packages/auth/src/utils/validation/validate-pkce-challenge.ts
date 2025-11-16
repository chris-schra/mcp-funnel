import { createHash } from 'node:crypto';
import { CodeChallengeMethods } from '@mcp-funnel/models';

/**
 * Validates a PKCE (Proof Key for Code Exchange) code verifier against its challenge.
 *
 * Supports two challenge methods:
 * - **plain**: Direct string comparison (codeVerifier === codeChallenge)
 * - **S256**: SHA-256 hash comparison (base64url-encoded hash of verifier === challenge)
 * @param codeVerifier - The code verifier string sent by the client in the token request
 * @param codeChallenge - The code challenge string stored during the authorization request
 * @param method - The challenge method used ('plain' or 'S256'). Unsupported methods return false
 * @returns `true` if the verifier is valid for the given challenge and method, `false` otherwise
 * @example Plain method validation
 * ```typescript
 * const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
 * validatePkceChallenge(verifier, verifier, 'plain'); // true
 * validatePkceChallenge('wrong', verifier, 'plain'); // false
 * ```
 * @example S256 method validation
 * ```typescript
 * const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
 * const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'; // SHA-256 hash of verifier
 * validatePkceChallenge(verifier, challenge, 'S256'); // true
 * ```
 * @public
 * @see file:../../provider/token-utils/handleAuthorizationCodeGrant.ts:118 - Usage in token exchange flow
 * @see file:./__tests__/../oauth-utils.test.ts:336 - Test coverage
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
