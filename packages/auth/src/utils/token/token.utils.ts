/**
 * Token-related utilities for OAuth
 */

import { generateSecureToken } from './generate-secure-token.js';
import { parseTokenResponse } from './parse-token-response.js';
import { extractBearerToken } from './extract-bearer-token.js';

export class TokenUtils {
  public static generateSecureToken = generateSecureToken;

  public static generateAuthorizationCode(): string {
    return generateSecureToken(32);
  }

  public static generateAccessToken(): string {
    return generateSecureToken(32);
  }

  public static generateRefreshToken(): string {
    return generateSecureToken(32);
  }

  public static generateClientId(): string {
    return generateSecureToken(16);
  }

  public static generateClientSecret(): string {
    return generateSecureToken(32);
  }

  public static parseTokenResponse = parseTokenResponse;
  public static extractBearerToken = extractBearerToken;

  public static getCurrentTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  public static isExpired(expiresAt: number): boolean {
    return TokenUtils.getCurrentTimestamp() >= expiresAt;
  }
}

// Re-export individual functions for direct import
export { generateSecureToken } from './generate-secure-token.js';
export { parseTokenResponse } from './parse-token-response.js';
export { extractBearerToken } from './extract-bearer-token.js';
