/**
 * Tests for OAuth scope utility functions
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../../utils/index.js';

const { parseScopes, formatScopes, validateScopes } = OAuthUtils;

describe('Scope Utilities', () => {
  it('should parse space-separated scopes', () => {
    const result = parseScopes('read write admin');
    expect(result).toEqual(['read', 'write', 'admin']);
  });

  it('should handle empty scope string', () => {
    const result = parseScopes('');
    expect(result).toEqual([]);
  });

  it('should handle undefined scope', () => {
    const result = parseScopes(undefined);
    expect(result).toEqual([]);
  });

  it('should filter out empty scopes', () => {
    const result = parseScopes('read  write   admin');
    expect(result).toEqual(['read', 'write', 'admin']);
  });

  it('should format scopes to space-separated string', () => {
    const result = formatScopes(['read', 'write', 'admin']);
    expect(result).toBe('read write admin');
  });

  it('should validate scopes against supported list', () => {
    const supportedScopes = ['read', 'write', 'admin'];

    expect(validateScopes(['read'], supportedScopes)).toBe(true);
    expect(validateScopes(['read', 'write'], supportedScopes)).toBe(true);
    expect(validateScopes(['read', 'invalid'], supportedScopes)).toBe(false);
    expect(validateScopes(['invalid'], supportedScopes)).toBe(false);
  });
});
