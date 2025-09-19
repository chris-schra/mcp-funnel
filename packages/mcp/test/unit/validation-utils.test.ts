import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationUtils } from '../../src/utils/validation-utils.js';

describe('ValidationUtils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('validateUrl', () => {
    it('should accept valid URLs', () => {
      expect(() =>
        ValidationUtils.validateUrl('https://example.com'),
      ).not.toThrow();
      expect(() =>
        ValidationUtils.validateUrl('http://localhost:3000'),
      ).not.toThrow();
      expect(() =>
        ValidationUtils.validateUrl('wss://websocket.example.com'),
      ).not.toThrow();
    });

    it('should throw for invalid URLs', () => {
      expect(() => ValidationUtils.validateUrl('not-a-url')).toThrow(
        'Invalid URL format',
      );
      expect(() => ValidationUtils.validateUrl('://missing-protocol')).toThrow(
        'Invalid URL format',
      );
    });

    it('should throw for empty URLs', () => {
      expect(() => ValidationUtils.validateUrl('')).toThrow('URL is required');
    });

    it('should include context in error messages', () => {
      expect(() =>
        ValidationUtils.validateUrl('invalid', 'token endpoint'),
      ).toThrow('token endpoint: Invalid URL format');
      expect(() => ValidationUtils.validateUrl('', 'redirect URI')).toThrow(
        'redirect URI: URL is required',
      );
    });
  });

  describe('validateUrls', () => {
    it('should validate multiple URLs', () => {
      const urls = {
        authUrl: 'https://auth.example.com',
        tokenUrl: 'https://token.example.com',
        redirectUrl: 'https://redirect.example.com',
      };
      expect(() => ValidationUtils.validateUrls(urls)).not.toThrow();
    });

    it('should throw for any invalid URL', () => {
      const urls = {
        authUrl: 'https://auth.example.com',
        tokenUrl: 'invalid-url',
        redirectUrl: 'https://redirect.example.com',
      };
      expect(() => ValidationUtils.validateUrls(urls)).toThrow(
        'tokenUrl: Invalid URL format',
      );
    });

    it('should skip undefined URLs', () => {
      const urls = {
        authUrl: 'https://auth.example.com',
        tokenUrl: undefined,
        redirectUrl: 'https://redirect.example.com',
      };
      expect(() => ValidationUtils.validateUrls(urls)).not.toThrow();
    });
  });

  describe('sanitizeServerId', () => {
    it('should accept valid server IDs', () => {
      expect(ValidationUtils.sanitizeServerId('server1')).toBe('server1');
      expect(ValidationUtils.sanitizeServerId('my-server_name.test')).toBe(
        'my-server_name.test',
      );
      expect(ValidationUtils.sanitizeServerId('ABC123')).toBe('ABC123');
    });

    it('should throw for unsafe characters', () => {
      expect(() => ValidationUtils.sanitizeServerId('server/path')).toThrow(
        'unsafe characters',
      );
      expect(() => ValidationUtils.sanitizeServerId('server;command')).toThrow(
        'unsafe characters',
      );
      expect(() =>
        ValidationUtils.sanitizeServerId('server$injection'),
      ).toThrow('unsafe characters');
      expect(() =>
        ValidationUtils.sanitizeServerId('server with spaces'),
      ).toThrow('unsafe characters');
    });
  });

  describe('resolveEnvironmentVariables', () => {
    it('should resolve environment variables', () => {
      process.env.TEST_VAR = 'test-value';
      const result = ValidationUtils.resolveEnvironmentVariables(
        'prefix-${TEST_VAR}-suffix',
      );
      expect(result).toBe('prefix-test-value-suffix');
    });

    it('should handle multiple environment variables', () => {
      process.env.VAR1 = 'value1';
      process.env.VAR2 = 'value2';
      const result =
        ValidationUtils.resolveEnvironmentVariables('${VAR1}-${VAR2}');
      expect(result).toBe('value1-value2');
    });

    it('should return original string if no variables', () => {
      const result =
        ValidationUtils.resolveEnvironmentVariables('no-variables-here');
      expect(result).toBe('no-variables-here');
    });

    it('should throw for undefined environment variables', () => {
      expect(() => {
        ValidationUtils.resolveEnvironmentVariables('${UNDEFINED_VAR}');
      }).toThrow('Environment variable UNDEFINED_VAR is not defined');
    });
  });

  describe('hasEnvironmentVariables', () => {
    it('should detect environment variables', () => {
      expect(ValidationUtils.hasEnvironmentVariables('${VAR}')).toBe(true);
      expect(
        ValidationUtils.hasEnvironmentVariables('prefix-${VAR}-suffix'),
      ).toBe(true);
      expect(ValidationUtils.hasEnvironmentVariables('${VAR1}-${VAR2}')).toBe(
        true,
      );
    });

    it('should return false for strings without variables', () => {
      expect(ValidationUtils.hasEnvironmentVariables('no-variables')).toBe(
        false,
      );
      expect(
        ValidationUtils.hasEnvironmentVariables('missing-braces-VAR'),
      ).toBe(false);
      expect(ValidationUtils.hasEnvironmentVariables('${incomplete')).toBe(
        false,
      );
    });
  });

  describe('validateRequired', () => {
    it('should accept objects with all required fields', () => {
      const config = {
        clientId: 'id',
        clientSecret: 'secret',
        tokenUrl: 'https://token.com',
      };
      expect(() => {
        ValidationUtils.validateRequired(config, [
          'clientId',
          'clientSecret',
          'tokenUrl',
        ]);
      }).not.toThrow();
    });

    it('should throw for missing required fields', () => {
      const config = { clientId: 'id', tokenUrl: 'https://token.com' };
      expect(() => {
        ValidationUtils.validateRequired(config, [
          'clientId',
          'clientSecret',
          'tokenUrl',
        ]);
      }).toThrow('Missing required field: clientSecret');
    });

    it('should include context in error messages', () => {
      const config = { clientId: 'id' };
      expect(() => {
        ValidationUtils.validateRequired(
          config,
          ['clientSecret'],
          'OAuth config',
        );
      }).toThrow('OAuth config: Missing required field: clientSecret');
    });
  });

  describe('validateOAuthUrls', () => {
    it('should validate OAuth configuration URLs', () => {
      const config = {
        authorizationEndpoint: 'https://auth.example.com',
        tokenEndpoint: 'https://token.example.com',
        redirectUri: 'https://redirect.example.com',
      };
      expect(() => ValidationUtils.validateOAuthUrls(config)).not.toThrow();
    });

    it('should throw for invalid OAuth URLs', () => {
      const config = {
        authorizationEndpoint: 'https://auth.example.com',
        tokenEndpoint: 'invalid-url',
        redirectUri: 'https://redirect.example.com',
      };
      expect(() => ValidationUtils.validateOAuthUrls(config)).toThrow(
        'tokenEndpoint: Invalid URL format',
      );
    });

    it('should handle missing optional URLs', () => {
      const config = {
        authorizationEndpoint: 'https://auth.example.com',
      };
      expect(() => ValidationUtils.validateOAuthUrls(config)).not.toThrow();
    });
  });
});
