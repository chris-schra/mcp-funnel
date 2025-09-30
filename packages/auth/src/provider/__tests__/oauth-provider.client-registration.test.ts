import { describe, it, expect, beforeEach } from 'vitest';
import { OauthTestUtils, type OAuthTestContext } from './test-utils.js';

describe('OAuthProvider - Client Registration', () => {
  let context: OAuthTestContext;

  beforeEach(() => {
    context = OauthTestUtils.createOAuthProvider();
  });

  it('registers a new client successfully', async () => {
    const { oauthProvider } = context;
    const clientMetadata = {
      client_name: 'Test Client',
      redirect_uris: ['http://localhost:8080/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope: 'read write',
    };

    const client = await oauthProvider.registerClient(clientMetadata);

    expect(client.client_id).toBeDefined();
    expect(client.client_secret).toBeDefined();
    expect(client.client_name).toBe('Test Client');
    expect(client.redirect_uris).toEqual(['http://localhost:8080/callback']);
    expect(client.grant_types).toEqual(['authorization_code']);
    expect(client.response_types).toEqual(['code']);
    expect(client.scope).toBe('read write');
    expect(client.client_id_issued_at).toBeDefined();
    expect(client.client_secret_expires_at).toBeGreaterThan(
      Math.floor(Date.now() / 1000),
    );
  });

  it('creates a client with defaults when optional fields are omitted', async () => {
    const { oauthProvider } = context;
    const clientMetadata = {
      redirect_uris: ['http://localhost:8080/callback'],
    };

    const client = await oauthProvider.registerClient(clientMetadata);

    expect(client.grant_types).toEqual(['authorization_code']);
    expect(client.response_types).toEqual(['code']);
    expect(client.client_name).toBeUndefined();
    expect(client.scope).toBeUndefined();
  });

  it('sets the client secret expiry to one year by default', async () => {
    const { oauthProvider } = context;
    const clientMetadata = {
      client_name: 'Test Client',
      redirect_uris: ['http://localhost:8080/callback'],
    };

    const client = await oauthProvider.registerClient(clientMetadata);
    const currentTime = Math.floor(Date.now() / 1000);
    const oneYearFromNow = currentTime + 31_536_000; // 1 year in seconds

    expect(client.client_secret_expires_at).toBeGreaterThan(currentTime);
    expect(client.client_secret_expires_at).toBeLessThan(oneYearFromNow + 60);
    expect(client.client_secret_expires_at).toBeGreaterThan(
      oneYearFromNow - 60,
    );
  });
});
