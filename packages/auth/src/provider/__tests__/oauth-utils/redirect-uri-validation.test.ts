/**
 * Tests for OAuth redirect URI validation
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../../utils/index.js';
import { type ClientRegistration } from '@mcp-funnel/models';

const { validateRedirectUri } = OAuthUtils;

describe('Redirect URI Validation', () => {
  const client: ClientRegistration = {
    client_id: 'test-client',
    redirect_uris: [
      'http://localhost:8080/callback',
      'https://app.example.com/oauth/callback',
    ],
  };

  it('should validate registered redirect URI', () => {
    const result = validateRedirectUri(
      client,
      'http://localhost:8080/callback',
    );
    expect(result).toBe(true);
  });

  it('should reject unregistered redirect URI', () => {
    const result = validateRedirectUri(client, 'http://evil.com/callback');
    expect(result).toBe(false);
  });
});
