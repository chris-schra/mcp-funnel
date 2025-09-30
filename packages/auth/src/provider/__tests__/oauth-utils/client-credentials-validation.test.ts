/**
 * Tests for OAuth client credentials validation
 */

import { describe, it, expect } from 'vitest';

import { OAuthUtils } from '../../../utils/index.js';
import { type ClientRegistration } from '@mcp-funnel/models';

const { validateClientCredentials } = OAuthUtils;

describe('Client Credentials Validation', () => {
  it('should validate public client without secret', () => {
    const client: ClientRegistration = {
      client_id: 'public-client',
      redirect_uris: ['http://localhost:8080/callback'],
    };

    const result = validateClientCredentials(client);
    expect(result).toBe(true);
  });

  it('should validate confidential client with correct secret', () => {
    const client: ClientRegistration = {
      client_id: 'confidential-client',
      client_secret: 'secret123',
      redirect_uris: ['http://localhost:8080/callback'],
    };

    const result = validateClientCredentials(client, 'secret123');
    expect(result).toBe(true);
  });

  it('should reject confidential client with wrong secret', () => {
    const client: ClientRegistration = {
      client_id: 'confidential-client',
      client_secret: 'secret123',
      redirect_uris: ['http://localhost:8080/callback'],
    };

    const result = validateClientCredentials(client, 'wrong-secret');
    expect(result).toBe(false);
  });

  it('should reject public client with provided secret', () => {
    const client: ClientRegistration = {
      client_id: 'public-client',
      redirect_uris: ['http://localhost:8080/callback'],
    };

    const result = validateClientCredentials(client, 'some-secret');
    expect(result).toBe(false);
  });
});
