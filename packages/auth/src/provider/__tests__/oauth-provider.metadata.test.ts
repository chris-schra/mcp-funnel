import { describe, it, expect, beforeEach } from 'vitest';
import { OauthTestUtils, type OAuthTestContext } from './test-utils.js';

describe('OAuthProvider - Metadata', () => {
  let context: OAuthTestContext;

  beforeEach(() => {
    context = OauthTestUtils.createOAuthProvider();
  });

  it('returns the expected metadata', () => {
    const { oauthProvider } = context;

    const metadata = oauthProvider.getMetadata();

    expect(metadata.issuer).toBe('http://localhost:3000');
    expect(metadata.authorization_endpoint).toBe('http://localhost:3000/api/oauth/authorize');
    expect(metadata.token_endpoint).toBe('http://localhost:3000/api/oauth/token');
    expect(metadata.revocation_endpoint).toBe('http://localhost:3000/api/oauth/revoke');
    expect(metadata.scopes_supported).toEqual(['read', 'write', 'admin']);
    expect(metadata.response_types_supported).toEqual(['code']);
    expect(metadata.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['client_secret_post', 'none']);
    expect(metadata.code_challenge_methods_supported).toEqual(['plain', 'S256']);
  });
});
