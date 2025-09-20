import { describe, it, expect } from 'vitest';
import { oauthRoute } from '../oauth.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

describe('OAuth API - Client Secret Rotation', () => {
  it('rotates client secret and returns a new secret with updated expiry', async () => {
    const registerResponse = await oauthRoute.request('/register', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        client_name: 'Rotation Test Client',
        redirect_uris: ['http://localhost:8080/callback'],
      }),
    });

    expect(registerResponse.status).toBe(201);
    const registerData = await registerResponse.json();

    const rotateResponse = await oauthRoute.request(
      `/clients/${registerData.client_id}/rotate-secret`,
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          client_secret: registerData.client_secret,
        }),
      },
    );

    expect(rotateResponse.status).toBe(200);
    const rotateData = await rotateResponse.json();

    expect(rotateData.client_id).toBe(registerData.client_id);
    expect(rotateData.client_secret).toBeDefined();
    expect(rotateData.client_secret).not.toBe(registerData.client_secret);
    expect(typeof rotateData.client_secret_expires_at).toBe('number');
    expect(rotateData.client_secret_expires_at).toBeGreaterThanOrEqual(
      registerData.client_secret_expires_at,
    );
  });

  it('rejects rotation when the provided secret is invalid', async () => {
    const registerResponse = await oauthRoute.request('/register', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        client_name: 'Rotation Failure Client',
        redirect_uris: ['http://localhost:8080/callback'],
      }),
    });

    expect(registerResponse.status).toBe(201);
    const registerData = await registerResponse.json();

    const invalidResponse = await oauthRoute.request(
      `/clients/${registerData.client_id}/rotate-secret`,
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          client_secret: 'not-the-right-secret',
        }),
      },
    );

    expect(invalidResponse.status).toBe(401);
    const errorData = await invalidResponse.json();
    expect(errorData.error).toBe('invalid_client');
  });
});
