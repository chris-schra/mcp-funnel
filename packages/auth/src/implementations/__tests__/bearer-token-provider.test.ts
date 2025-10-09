import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BearerTokenAuthProvider } from '../bearer-token-provider.js';
import { AuthenticationError, AuthErrorCode } from '../../errors/authentication-error.js';
import * as coreModule from '@mcp-funnel/core';

// Mock the logEvent function to verify security requirements
vi.mock('@mcp-funnel/core', async () => {
  const actual = await vi.importActual<typeof coreModule>('@mcp-funnel/core');
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

describe('BearerTokenAuthProvider', () => {
  let mockLogEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogEvent = vi.mocked(coreModule.logEvent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor validation', () => {
    it('should successfully create provider with valid token and log event', () => {
      const provider = new BearerTokenAuthProvider({ token: 'valid-api-key-123' });

      expect(provider).toBeInstanceOf(BearerTokenAuthProvider);
      expect(mockLogEvent).toHaveBeenCalledWith('info', 'auth:provider_created', {
        type: 'BearerTokenAuthProvider',
        tokenLength: 17,
        timestamp: expect.any(String),
      });
    });

    it('should throw AuthenticationError with MISSING_TOKEN for empty/whitespace tokens', () => {
      const invalidTokens = ['', '   ', ' ', '  \t\n  '];

      invalidTokens.forEach((token) => {
        expect(() => new BearerTokenAuthProvider({ token })).toThrow(AuthenticationError);

        try {
          new BearerTokenAuthProvider({ token });
          expect.fail('Expected AuthenticationError to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AuthenticationError);
          expect((error as AuthenticationError).code).toBe(AuthErrorCode.MISSING_TOKEN);
          expect((error as AuthenticationError).message).toBe('No access token provided');
        }
      });
    });

    it('should accept minimal and very long tokens', () => {
      const minimalProvider = new BearerTokenAuthProvider({ token: 'a' });
      expect(minimalProvider).toBeInstanceOf(BearerTokenAuthProvider);

      const longToken = 'x'.repeat(500);
      const longProvider = new BearerTokenAuthProvider({ token: longToken });
      expect(longProvider).toBeInstanceOf(BearerTokenAuthProvider);
      expect(mockLogEvent).toHaveBeenCalledWith(
        'info',
        'auth:provider_created',
        expect.objectContaining({ tokenLength: 500 }),
      );
    });
  });

  describe('getHeaders()', () => {
    it('should return Bearer token in Authorization header and be consistent', async () => {
      const provider = new BearerTokenAuthProvider({ token: 'test-token-abc123' });

      const headers1 = await provider.getHeaders();
      const headers2 = await provider.getHeaders();

      expect(headers1).toEqual({ Authorization: 'Bearer test-token-abc123' });
      expect(headers1).toEqual(headers2);
    });

    it('should handle special characters in token', async () => {
      const specialToken = 'token-with-special_chars.123/abc+def=';
      const provider = new BearerTokenAuthProvider({ token: specialToken });

      const headers = await provider.getHeaders();
      expect(headers).toEqual({ Authorization: `Bearer ${specialToken}` });
    });
  });

  describe('isValid()', () => {
    it('should always return true immediately for static token', async () => {
      const provider = new BearerTokenAuthProvider({ token: 'valid-token' });

      const startTime = Date.now();
      const isValid1 = await provider.isValid();
      const isValid2 = await provider.isValid();
      const endTime = Date.now();

      expect(isValid1).toBe(true);
      expect(isValid2).toBe(true);
      expect(endTime - startTime).toBeLessThan(10);
    });
  });

  describe('refresh() [optional method]', () => {
    it('should be callable, log noop action, and not modify token', async () => {
      const provider = new BearerTokenAuthProvider({ token: 'original-token' });
      const headersBefore = await provider.getHeaders();

      expect(provider.refresh).toBeDefined();
      expect(typeof provider.refresh).toBe('function');

      mockLogEvent.mockClear();
      await expect(provider.refresh?.()).resolves.not.toThrow();

      expect(mockLogEvent).toHaveBeenCalledWith('debug', 'auth:refresh_attempted', {
        type: 'BearerTokenAuthProvider',
        action: 'noop',
        reason: 'static_token',
        timestamp: expect.any(String),
      });

      const headersAfter = await provider.getHeaders();
      expect(headersAfter).toEqual(headersBefore);
    });
  });

  describe('Token security', () => {
    it('should log tokenLength with ISO timestamp but never the actual token', () => {
      const secretToken = 'super-secret-token-xyz-789';
      new BearerTokenAuthProvider({ token: secretToken });

      expect(mockLogEvent).toHaveBeenCalledWith('info', 'auth:provider_created', {
        type: 'BearerTokenAuthProvider',
        tokenLength: secretToken.length,
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      });

      const logCalls = mockLogEvent.mock.calls;
      logCalls.forEach((call) => {
        const dataArg = call[2];
        const stringified = JSON.stringify(dataArg);
        expect(stringified).not.toContain(secretToken);
        expect(dataArg).not.toHaveProperty('token');
      });
    });

    it('should not expose token in error messages', () => {
      try {
        new BearerTokenAuthProvider({ token: '' });
        expect.fail('Expected AuthenticationError to be thrown');
      } catch (error) {
        expect((error as Error).message).toBe('No access token provided');
        expect((error as Error).message).not.toContain('token: ');
      }
    });
  });

  describe('Integration scenarios', () => {
    it('should implement IAuthProvider interface and maintain token across operations', async () => {
      const provider = new BearerTokenAuthProvider({ token: 'persistent-token' });

      expect(provider.getHeaders).toBeDefined();
      expect(provider.isValid).toBeDefined();
      expect(typeof provider.getHeaders).toBe('function');
      expect(typeof provider.isValid).toBe('function');

      const headers1 = await provider.getHeaders();
      const valid1 = await provider.isValid();
      await provider.refresh?.();
      const headers2 = await provider.getHeaders();
      const valid2 = await provider.isValid();

      expect(headers1.Authorization).toMatch(/^Bearer .+$/);
      expect(headers1.Authorization).toBe('Bearer persistent-token');
      expect(headers2.Authorization).toBe('Bearer persistent-token');
      expect(valid1).toBe(true);
      expect(valid2).toBe(true);
      expect(headers1).toBeTypeOf('object');
    });
  });

  describe('Edge cases', () => {
    it('should handle various token formats (Base64, JWT, Unicode, numeric)', async () => {
      const tokens = [
        '12345678901234567890',
        'dGVzdC10b2tlbi1iYXNlNjQtZW5jb2RlZA==',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        'token-with-émojis-🔐-and-中文',
      ];

      for (const token of tokens) {
        const provider = new BearerTokenAuthProvider({ token });
        const headers = await provider.getHeaders();
        expect(headers.Authorization).toBe(`Bearer ${token}`);
      }
    });
  });

  describe('Error handling', () => {
    it('should throw AuthenticationError with proper code and message', () => {
      try {
        new BearerTokenAuthProvider({ token: '' });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(AuthenticationError);
        const authError = error as AuthenticationError;
        expect(authError.code).toBe(AuthErrorCode.MISSING_TOKEN);
        expect(typeof authError.code).toBe('string');
        expect(authError.message).toBe('No access token provided');
        expect(authError.message.length).toBeGreaterThan(0);
      }
    });
  });
});
