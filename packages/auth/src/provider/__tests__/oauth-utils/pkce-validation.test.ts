/**
 * Tests for OAuth PKCE validation
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../../utils/index.js';

const { validatePkceChallenge } = OAuthUtils;

describe('PKCE Validation', () => {
  it('should validate plain PKCE challenge', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = verifier;

    const result = validatePkceChallenge(verifier, challenge, 'plain');
    expect(result).toBe(true);
  });

  it('should validate S256 PKCE challenge', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const result = validatePkceChallenge(verifier, challenge, 'S256');
    expect(result).toBe(true);
  });

  it('should reject wrong plain PKCE verifier', () => {
    const verifier = 'wrong-verifier';
    const challenge = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    const result = validatePkceChallenge(verifier, challenge, 'plain');
    expect(result).toBe(false);
  });

  it('should reject wrong S256 PKCE verifier', () => {
    const verifier = 'wrong-verifier';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const result = validatePkceChallenge(verifier, challenge, 'S256');
    expect(result).toBe(false);
  });

  it('should reject unsupported PKCE method', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = verifier;

    const result = validatePkceChallenge(verifier, challenge, 'unsupported');
    expect(result).toBe(false);
  });
});
