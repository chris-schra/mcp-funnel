/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth2 Authorization Code flow
 * Pure functions with no side effects
 */
import { randomBytes, createHash } from 'crypto';

/**
 * Encodes a buffer to URL-safe base64 format per RFC 4648 Section 5.
 *
 * Converts standard base64 to URL-safe variant by replacing `+` with `-`,
 * `/` with `_`, and removing padding `=` characters.
 * @param buffer - Buffer to encode
 * @returns URL-safe base64 encoded string
 * @internal
 * @see file:./pkce.ts:22 - Used by generateCodeVerifier
 * @see file:./pkce.ts:30 - Used by generateCodeChallenge
 */
export function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generates a cryptographically random PKCE code verifier.
 *
 * Creates a 32-byte random value and encodes it as URL-safe base64,
 * meeting PKCE requirements (RFC 7636 Section 4.1) for code verifier
 * length (43-128 characters).
 * @returns URL-safe base64 encoded code verifier (43 characters)
 * @example
 * ```typescript
 * const verifier = generateCodeVerifier();
 * const challenge = generateCodeChallenge(verifier);
 * // Use challenge in authorization request, store verifier for token exchange
 * ```
 * @public
 * @see file:./pkce.ts:30 - generateCodeChallenge for creating the corresponding challenge
 * @see file:../implementations/oauth2-authorization-code.ts:313 - Usage in OAuth2 flow
 */
export function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32));
}

/**
 * Generates a PKCE code challenge from a code verifier using SHA256.
 *
 * Creates SHA256 hash of the verifier and encodes as URL-safe base64,
 * implementing the S256 challenge method per RFC 7636 Section 4.2.
 * @param verifier - Code verifier string from generateCodeVerifier
 * @returns URL-safe base64 encoded SHA256 hash of the verifier (43 characters)
 * @example
 * ```typescript
 * const verifier = generateCodeVerifier();
 * const challenge = generateCodeChallenge(verifier);
 *
 * // Send challenge in authorization request
 * const authUrl = new URL(authEndpoint);
 * authUrl.searchParams.set('code_challenge', challenge);
 * authUrl.searchParams.set('code_challenge_method', 'S256');
 *
 * // Later, send verifier in token exchange
 * await fetch(tokenEndpoint, {
 *   body: new URLSearchParams({ code_verifier: verifier, ... })
 * });
 * ```
 * @public
 * @see file:./pkce.ts:22 - generateCodeVerifier for creating the verifier
 * @see file:../implementations/oauth2-authorization-code.ts:314 - Usage in OAuth2 flow
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return base64URLEncode(hash);
}

/**
 * Generates a cryptographically random OAuth2 state parameter.
 *
 * Creates a 16-byte random value and encodes it as URL-safe base64,
 * providing CSRF protection for OAuth2 authorization flows per RFC 6749
 * Section 10.12.
 * @returns URL-safe base64 encoded state parameter (22 characters)
 * @example
 * ```typescript
 * const state = generateState();
 *
 * // Send in authorization request
 * const authUrl = new URL(authEndpoint);
 * authUrl.searchParams.set('state', state);
 *
 * // Verify in callback
 * if (callbackState !== state) {
 *   throw new Error('Invalid state - possible CSRF attack');
 * }
 * ```
 * @public
 * @see file:../implementations/oauth2-authorization-code.ts:312 - Usage in OAuth2 flow
 * @see file:./auth-url.ts:16 - AuthUrlParams interface using state parameter
 */
export function generateState(): string {
  return base64URLEncode(randomBytes(16));
}
