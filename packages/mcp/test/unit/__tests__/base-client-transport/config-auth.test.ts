/**
 * Tests for configuration management and authentication integration
 */

import { describe, it, expect } from 'vitest';
import {
  setupBaseClientTransportTest,
  TestTransport,
  TransportError,
} from './test-utils.js';

describe('BaseClientTransport', () => {
  const { transport, mockAuthProvider, config } =
    setupBaseClientTransportTest();

  describe('Configuration Management', () => {
    it('validates URL during construction', () => {
      // Test that URL validation happens by checking that the transport was created successfully
      expect(transport).toBeDefined();
      expect(transport['config'].url).toBe('https://api.example.com/mcp');
    });

    it('throws error for invalid URL', () => {
      expect(() => {
        new TestTransport({ url: 'invalid-url' });
      }).toThrow('Invalid URL');
    });

    it('applies default timeout when not specified', () => {
      const defaultTransport = new TestTransport({
        url: 'https://example.com',
      });
      expect(defaultTransport['config'].timeout).toBe(30000);
    });

    it('applies custom timeout when specified', () => {
      expect(transport['config'].timeout).toBe(5000);
    });

    it('stores auth provider configuration', () => {
      expect(transport['config'].authProvider).toBe(mockAuthProvider);
    });
  });

  describe('Authentication Integration', () => {
    it('includes auth headers when auth provider is configured', async () => {
      const headers = await transport['getAuthHeaders']();
      expect(mockAuthProvider.getHeaders).toHaveBeenCalled();
      expect(headers).toEqual({
        Authorization: 'Bearer mock-token',
      });
    });

    it('returns empty headers when no auth provider', async () => {
      const noAuthTransport = new TestTransport({ url: 'https://example.com' });
      const headers = await noAuthTransport['getAuthHeaders']();
      expect(headers).toEqual({});
    });

    it('handles auth provider errors gracefully', async () => {
      const authError = new Error('Auth failed');
      (mockAuthProvider.getHeaders as ReturnType<typeof vi.fn>).mockRejectedValue(
        authError,
      );

      await expect(transport['getAuthHeaders']()).rejects.toThrow(
        TransportError,
      );
    });
  });
});