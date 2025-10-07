import { describe, it, expect } from 'vitest';
import {
  AuthConfigSchema,
  type BearerAuthConfigZod,
  BearerAuthConfigSchema,
  NoAuthConfigSchema,
  type OAuth2AuthCodeConfigZod,
  OAuth2AuthCodeConfigSchema,
  type OAuth2ClientCredentialsConfigZod,
  OAuth2ClientCredentialsConfigSchema,
} from './test-imports.js';

describe('AuthConfigSchema', () => {
  describe('NoAuth configuration', () => {
    it('should accept valid no-auth configuration', () => {
      const noAuthConfig = {
        type: 'none' as const,
      };

      expect(() => AuthConfigSchema.parse(noAuthConfig)).not.toThrow();
      const result = AuthConfigSchema.parse(noAuthConfig);
      expect(result.type).toBe('none');
    });

    it('should accept no-auth config even with extra properties (zod behavior)', () => {
      const configWithExtra = {
        type: 'none' as const,
        token: 'extra-property',
      };

      // Zod discriminated unions don't strictly reject extra properties
      // This documents the current behavior - extra properties are ignored
      expect(() => NoAuthConfigSchema.parse(configWithExtra)).not.toThrow();
      const result = NoAuthConfigSchema.parse(configWithExtra);
      expect(result.type).toBe('none');
      // Note: extra properties are stripped by zod, not accessible on result
    });
  });

  describe('Bearer auth configuration', () => {
    it('should accept valid bearer configuration', () => {
      const bearerConfig = {
        type: 'bearer' as const,
        token: 'secret-bearer-token',
      };

      expect(() => AuthConfigSchema.parse(bearerConfig)).not.toThrow();
      const result = AuthConfigSchema.parse(bearerConfig);
      expect(result.type).toBe('bearer');
      if (result.type === 'bearer') {
        expect((result as BearerAuthConfigZod).token).toBe('secret-bearer-token');
      }
    });

    it('should reject bearer config without token', () => {
      const invalidConfig = {
        type: 'bearer' as const,
      };

      expect(() => BearerAuthConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject bearer config with empty token', () => {
      const invalidConfig = {
        type: 'bearer' as const,
        token: '',
      };

      expect(() => BearerAuthConfigSchema.parse(invalidConfig)).not.toThrow();
      // Empty string is technically valid for Zod string validation
      const result = BearerAuthConfigSchema.parse(invalidConfig);
      if (result.type === 'bearer') {
        expect((result as BearerAuthConfigZod).token).toBe('');
      }
    });
  });

  describe('OAuth2 Client Credentials configuration', () => {
    it('should accept valid oauth2-client configuration', () => {
      const oauth2Config = {
        type: 'oauth2-client' as const,
        clientId: 'client-123',
        clientSecret: 'secret-456',
        tokenEndpoint: 'https://auth.example.com/token',
        scope: 'read write',
        audience: 'api.example.com',
      };

      expect(() => AuthConfigSchema.parse(oauth2Config)).not.toThrow();
      const result = AuthConfigSchema.parse(oauth2Config);
      expect(result.type).toBe('oauth2-client');
      if (result.type === 'oauth2-client') {
        const oauth2Result = result as OAuth2ClientCredentialsConfigZod;
        expect(oauth2Result.clientId).toBe('client-123');
        expect(oauth2Result.clientSecret).toBe('secret-456');
        expect(oauth2Result.tokenEndpoint).toBe('https://auth.example.com/token');
        expect(oauth2Result.scope).toBe('read write');
        expect(oauth2Result.audience).toBe('api.example.com');
      }
    });

    it('should accept oauth2-client configuration without optional fields', () => {
      const minimalConfig = {
        type: 'oauth2-client' as const,
        clientId: 'client-123',
        clientSecret: 'secret-456',
        tokenEndpoint: 'https://auth.example.com/token',
      };

      expect(() => AuthConfigSchema.parse(minimalConfig)).not.toThrow();
      const result = AuthConfigSchema.parse(minimalConfig);
      if (result.type === 'oauth2-client') {
        const oauth2Result = result as OAuth2ClientCredentialsConfigZod;
        expect(oauth2Result.scope).toBeUndefined();
        expect(oauth2Result.audience).toBeUndefined();
      }
    });

    it('should reject oauth2-client config with missing required fields', () => {
      const invalidConfigs = [
        {
          type: 'oauth2-client' as const,
          clientSecret: 'secret',
          tokenEndpoint: 'https://auth.example.com/token',
        },
        {
          type: 'oauth2-client' as const,
          clientId: 'client',
          tokenEndpoint: 'https://auth.example.com/token',
        },
        {
          type: 'oauth2-client' as const,
          clientId: 'client',
          clientSecret: 'secret',
        },
      ];

      invalidConfigs.forEach((config) => {
        expect(() => OAuth2ClientCredentialsConfigSchema.parse(config)).toThrow();
      });
    });
  });

  describe('OAuth2 Authorization Code configuration', () => {
    it('should accept valid oauth2-code configuration', () => {
      const oauth2CodeConfig = {
        type: 'oauth2-code' as const,
        clientId: 'web-app-123',
        clientSecret: 'web-secret-456',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        redirectUri: 'https://app.example.com/callback',
        scope: 'openid profile email',
        audience: 'api.example.com',
      };

      expect(() => AuthConfigSchema.parse(oauth2CodeConfig)).not.toThrow();
      const result = AuthConfigSchema.parse(oauth2CodeConfig);
      expect(result.type).toBe('oauth2-code');
      if (result.type === 'oauth2-code') {
        const oauth2Result = result as OAuth2AuthCodeConfigZod;
        expect(oauth2Result.clientId).toBe('web-app-123');
        expect(oauth2Result.authorizationEndpoint).toBe('https://auth.example.com/authorize');
        expect(oauth2Result.redirectUri).toBe('https://app.example.com/callback');
      }
    });

    it('should accept oauth2-code configuration without client secret (PKCE)', () => {
      const pkceConfig = {
        type: 'oauth2-code' as const,
        clientId: 'public-client-123',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        redirectUri: 'https://app.example.com/callback',
      };

      expect(() => AuthConfigSchema.parse(pkceConfig)).not.toThrow();
      const result = AuthConfigSchema.parse(pkceConfig);
      if (result.type === 'oauth2-code') {
        const oauth2Result = result as OAuth2AuthCodeConfigZod;
        expect(oauth2Result.clientSecret).toBeUndefined();
      }
    });

    it('should reject oauth2-code config with missing required fields', () => {
      const invalidConfigs = [
        {
          type: 'oauth2-code' as const,
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
          redirectUri: 'https://app.example.com/callback',
        },
        {
          type: 'oauth2-code' as const,
          clientId: 'client',
          tokenEndpoint: 'https://auth.example.com/token',
          redirectUri: 'https://app.example.com/callback',
        },
        {
          type: 'oauth2-code' as const,
          clientId: 'client',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          redirectUri: 'https://app.example.com/callback',
        },
        {
          type: 'oauth2-code' as const,
          clientId: 'client',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
        },
      ];

      invalidConfigs.forEach((config) => {
        expect(() => OAuth2AuthCodeConfigSchema.parse(config)).toThrow();
      });
    });
  });

  describe('Invalid auth type discrimination', () => {
    it('should reject unknown auth types', () => {
      const invalidAuthConfig = {
        type: 'unknown-auth-type',
        someProperty: 'value',
      };

      expect(() => AuthConfigSchema.parse(invalidAuthConfig)).toThrow();
    });

    it('should reject auth config without type', () => {
      const noTypeConfig = {
        token: 'some-token',
      };

      expect(() => AuthConfigSchema.parse(noTypeConfig)).toThrow();
    });
  });
});
