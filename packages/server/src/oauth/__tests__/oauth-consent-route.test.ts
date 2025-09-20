import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { oauthRoute } from '../../api/oauth.js';

const registerResponseSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  redirect_uris: z.array(z.string()).min(1),
});

async function readJson<T>(response: Response, schema: z.ZodType<T>) {
  const payload = await response.json();
  return schema.parse(payload);
}

async function registerClient(clientName: string) {
  const response = await oauthRoute.request('/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: ['http://localhost:8080/callback'],
    }),
  });

  expect(response.status).toBe(201);
  const payload = await readJson(response, registerResponseSchema);

  return {
    clientId: payload.client_id,
    redirectUri: payload.redirect_uris[0],
  };
}

describe('OAuth consent HTTP endpoints', () => {
  it('returns access_denied when the user denies consent', async () => {
    const { clientId, redirectUri } = await registerClient('Deny App');
    const userId = 'user-deny-1';

    const denyResponse = await oauthRoute.request('/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        client_id: clientId,
        decision: 'deny',
        scopes: ['read'],
        state: 'deny-state',
        redirect_uri: redirectUri,
      }),
    });

    expect(denyResponse.status).toBe(200);
    const body = await readJson(
      denyResponse,
      z.object({
        status: z.literal('denied'),
        error: z.literal('access_denied'),
        error_description: z.string(),
      }),
    );
    expect(body.status).toBe('denied');
    expect(body.error).toBe('access_denied');
    expect(body.error_description).toBe(
      'The resource owner denied the request',
    );
  });

  it('records consent approval and allows authorization to continue', async () => {
    const { clientId, redirectUri } = await registerClient('Approve App');
    const userId = 'user-approve-1';

    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read',
      state: 'approve-state',
    });

    const initialAuthorize = await oauthRoute.request(
      `/authorize?${authorizeParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      },
    );

    expect(initialAuthorize.status).toBe(302);
    const initialLocation = initialAuthorize.headers.get('location');
    expect(initialLocation).toBeTruthy();
    const initialRedirect = new URL(initialLocation ?? '', 'http://localhost');
    expect(initialRedirect.searchParams.get('error')).toBe('consent_required');

    const consentResponse = await oauthRoute.request('/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        client_id: clientId,
        decision: 'approve',
        scopes: ['read'],
        redirect_uri: redirectUri,
        state: 'approve-state',
      }),
    });

    expect(consentResponse.status).toBe(200);
    const consentBody = await readJson(
      consentResponse,
      z.object({
        status: z.literal('approved'),
        consented_scopes: z.array(z.string()),
        remember: z.boolean().optional(),
        ttl_seconds: z.number().nullable().optional(),
      }),
    );
    expect(consentBody.status).toBe('approved');
    expect(consentBody.consented_scopes).toEqual(['read']);

    const postConsentAuthorize = await oauthRoute.request(
      `/authorize?${authorizeParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      },
    );

    expect(postConsentAuthorize.status).toBe(302);
    const successLocation = postConsentAuthorize.headers.get('location');
    expect(successLocation).toBeTruthy();
    const successRedirect = new URL(successLocation ?? '', 'http://localhost');
    expect(successRedirect.searchParams.get('code')).toBeTruthy();
    expect(successRedirect.searchParams.get('state')).toBe('approve-state');
  });

  it('persists partial scope approval and still requires consent for missing scopes', async () => {
    const { clientId, redirectUri } = await registerClient('Partial App');
    const userId = 'user-partial-1';

    const consentResponse = await oauthRoute.request('/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        client_id: clientId,
        decision: 'approve',
        scopes: ['read', 'write'],
        approved_scopes: ['read'],
        redirect_uri: redirectUri,
      }),
    });

    expect(consentResponse.status).toBe(200);
    const consentBody = await readJson(
      consentResponse,
      z.object({
        consented_scopes: z.array(z.string()),
        status: z.literal('approved'),
        remember: z.boolean().optional(),
        ttl_seconds: z.number().nullable().optional(),
      }),
    );
    expect(consentBody.consented_scopes).toEqual(['read']);

    const readOnlyAuthorize = await oauthRoute.request(
      `/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read',
      }).toString()}`,
      {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      },
    );

    expect(readOnlyAuthorize.status).toBe(302);
    const readLocation = readOnlyAuthorize.headers.get('location');
    expect(readLocation).toBeTruthy();
    const readRedirect = new URL(readLocation ?? '', 'http://localhost');
    expect(readRedirect.searchParams.get('code')).toBeTruthy();

    const writeAuthorize = await oauthRoute.request(
      `/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read write',
      }).toString()}`,
      {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      },
    );

    expect(writeAuthorize.status).toBe(302);
    const writeLocation = writeAuthorize.headers.get('location');
    expect(writeLocation).toBeTruthy();
    const writeRedirect = new URL(writeLocation ?? '', 'http://localhost');
    expect(writeRedirect.searchParams.get('error')).toBe('consent_required');
  });

  it('honours remember flag and custom TTL from JSON payloads', async () => {
    const { clientId, redirectUri } = await registerClient('Remember App');
    const userId = 'user-persistent-1';

    const consentResponse = await oauthRoute.request('/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        client_id: clientId,
        decision: 'approve',
        scopes: ['read'],
        redirect_uri: redirectUri,
        remember_decision: true,
        ttl_seconds: 3600,
      }),
    });

    expect(consentResponse.status).toBe(200);
    const consentBody = await readJson(
      consentResponse,
      z.object({
        status: z.literal('approved'),
        consented_scopes: z.array(z.string()),
        remember: z.boolean().optional(),
        ttl_seconds: z.number().nullable().optional(),
      }),
    );
    expect(consentBody.remember).toBe(true);
    expect(consentBody.ttl_seconds).toBe(3600);

    const authorizeResponse = await oauthRoute.request(
      `/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read',
      }).toString()}`,
      {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      },
    );

    expect(authorizeResponse.status).toBe(302);
    const authorizeLocation = authorizeResponse.headers.get('location');
    expect(authorizeLocation).toBeTruthy();
    const authorizeRedirect = new URL(
      authorizeLocation ?? '',
      'http://localhost',
    );
    expect(authorizeRedirect.searchParams.get('code')).toBeTruthy();
  });

  it('revokes individual scopes and forces re-consent for revoked permissions', async () => {
    const { clientId, redirectUri } = await registerClient('Revoke App');
    const userId = 'user-revoke-1';

    await oauthRoute.request('/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        client_id: clientId,
        decision: 'approve',
        scopes: ['read', 'write'],
        redirect_uri: redirectUri,
      }),
    });

    const revokeResponse = await oauthRoute.request('/consent/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        client_id: clientId,
        scopes: ['write'],
      }),
    });

    expect(revokeResponse.status).toBe(200);
    const revokeBody = await readJson(
      revokeResponse,
      z.object({
        revoked_scopes: z.array(z.string()),
        status: z.literal('success'),
        message: z.string(),
      }),
    );
    expect(revokeBody.revoked_scopes).toEqual(['write']);

    const readAuthorize = await oauthRoute.request(
      `/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read',
      }).toString()}`,
      {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      },
    );

    expect(readAuthorize.status).toBe(302);
    const readLocation = readAuthorize.headers.get('location');
    expect(readLocation).toBeTruthy();
    const readRedirect = new URL(readLocation ?? '', 'http://localhost');
    expect(readRedirect.searchParams.get('code')).toBeTruthy();

    const writeAuthorize = await oauthRoute.request(
      `/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'write',
      }).toString()}`,
      {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      },
    );

    expect(writeAuthorize.status).toBe(302);
    const writeLocation = writeAuthorize.headers.get('location');
    expect(writeLocation).toBeTruthy();
    const writeRedirect = new URL(writeLocation ?? '', 'http://localhost');
    expect(writeRedirect.searchParams.get('error')).toBe('consent_required');
  });
});
