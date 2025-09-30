/**
 * Tests for OAuth token generation functions
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../../utils/index.js';

const {
  generateSecureToken,
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken,
  generateClientId,
  generateClientSecret,
} = OAuthUtils;

describe('Token Generation', () => {
  it('should generate secure tokens of correct length', () => {
    const token1 = generateSecureToken(16);
    const token2 = generateSecureToken(16);

    expect(token1).toBeDefined();
    expect(token2).toBeDefined();
    expect(token1).not.toBe(token2); // Should be different
    expect(typeof token1).toBe('string');
    expect(typeof token2).toBe('string');
  });

  it('should generate authorization codes', () => {
    const code = generateAuthorizationCode();
    expect(code).toBeDefined();
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
  });

  it('should generate access tokens', () => {
    const token = generateAccessToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('should generate refresh tokens', () => {
    const token = generateRefreshToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('should generate client IDs', () => {
    const clientId = generateClientId();
    expect(clientId).toBeDefined();
    expect(typeof clientId).toBe('string');
    expect(clientId.length).toBeGreaterThan(0);
  });

  it('should generate client secrets', () => {
    const secret = generateClientSecret();
    expect(secret).toBeDefined();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
  });
});
