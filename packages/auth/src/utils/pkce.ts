/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth2 Authorization Code flow
 * Pure functions with no side effects
 */
import { randomBytes, createHash } from 'crypto';

export function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32));
}

export function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return base64URLEncode(hash);
}

export function generateState(): string {
  return base64URLEncode(randomBytes(16));
}
