import { describe, it, expect } from 'vitest';
import {
  type SSETransportConfigZod,
  type StdioTransportConfigZod,
  type WebSocketTransportConfigZod,
  TransportConfigSchema,
  StdioTransportConfigSchema,
  SSETransportConfigSchema,
} from './test-imports.js';

describe('TransportConfigSchema', () => {
  describe('Stdio transport configuration', () => {
    it('should accept valid stdio configuration', () => {
      const stdioConfig = {
        type: 'stdio' as const,
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'development' },
      };

      expect(() => TransportConfigSchema.parse(stdioConfig)).not.toThrow();
      const result = TransportConfigSchema.parse(stdioConfig);
      expect(result.type).toBe('stdio');
      if (result.type === 'stdio') {
        const stdioResult = result as StdioTransportConfigZod;
        expect(stdioResult.command).toBe('node');
        expect(stdioResult.args).toEqual(['server.js']);
        expect(stdioResult.env).toEqual({ NODE_ENV: 'development' });
      }
    });

    it('should accept minimal stdio configuration', () => {
      const minimalConfig = {
        type: 'stdio' as const,
        command: 'echo',
      };

      expect(() => TransportConfigSchema.parse(minimalConfig)).not.toThrow();
      const result = TransportConfigSchema.parse(minimalConfig);
      if (result.type === 'stdio') {
        const stdioResult = result as StdioTransportConfigZod;
        expect(stdioResult.args).toBeUndefined();
        expect(stdioResult.env).toBeUndefined();
      }
    });

    it('should reject stdio config without command', () => {
      const invalidConfig = {
        type: 'stdio' as const,
        args: ['some-args'],
      };

      expect(() => StdioTransportConfigSchema.parse(invalidConfig)).toThrow();
    });
  });

  describe('SSE transport configuration', () => {
    it('should accept valid SSE configuration', () => {
      const sseConfig = {
        type: 'sse' as const,
        url: 'https://api.example.com/events',
        timeout: 30000,
        reconnect: {
          maxAttempts: 5,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
        },
      };

      expect(() => TransportConfigSchema.parse(sseConfig)).not.toThrow();
      const result = TransportConfigSchema.parse(sseConfig);
      expect(result.type).toBe('sse');
      if (result.type === 'sse') {
        const sseResult = result as SSETransportConfigZod;
        expect(sseResult.url).toBe('https://api.example.com/events');
        expect(sseResult.timeout).toBe(30000);
        expect(sseResult.reconnect?.maxAttempts).toBe(5);
      }
    });

    it('should accept minimal SSE configuration', () => {
      const minimalConfig = {
        type: 'sse' as const,
        url: 'https://api.example.com/events',
      };

      expect(() => TransportConfigSchema.parse(minimalConfig)).not.toThrow();
      const result = TransportConfigSchema.parse(minimalConfig);
      if (result.type === 'sse') {
        const sseResult = result as SSETransportConfigZod;
        expect(sseResult.timeout).toBeUndefined();
        expect(sseResult.reconnect).toBeUndefined();
      }
    });

    it('should accept partial reconnect configuration', () => {
      const partialReconnectConfig = {
        type: 'sse' as const,
        url: 'https://api.example.com/events',
        reconnect: {
          maxAttempts: 3,
        },
      };

      expect(() =>
        TransportConfigSchema.parse(partialReconnectConfig),
      ).not.toThrow();
      const result = TransportConfigSchema.parse(partialReconnectConfig);
      if (result.type === 'sse') {
        const sseResult = result as SSETransportConfigZod;
        expect(sseResult.reconnect?.maxAttempts).toBe(3);
        expect(sseResult.reconnect?.initialDelayMs).toBeUndefined();
      }
    });

    it('should reject SSE config without URL', () => {
      const invalidConfig = {
        type: 'sse' as const,
        timeout: 30000,
      };

      expect(() => SSETransportConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject SSE config with invalid URL type', () => {
      const invalidConfig = {
        type: 'sse' as const,
        url: 123, // Should be string
      };

      expect(() => SSETransportConfigSchema.parse(invalidConfig)).toThrow();
    });
  });

  describe('WebSocket transport configuration', () => {
    it('should accept valid WebSocket configuration', () => {
      const websocketConfig = {
        type: 'websocket' as const,
        url: 'ws://api.example.com/websocket',
        timeout: 30000,
        reconnect: {
          maxAttempts: 5,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
        },
      };
      expect(() => TransportConfigSchema.parse(websocketConfig)).not.toThrow();
      const result = TransportConfigSchema.parse(websocketConfig);
      expect(result.type).toBe('websocket');
      if (result.type === 'websocket') {
        const wsResult = result as WebSocketTransportConfigZod;
        expect(wsResult.url).toBe('ws://api.example.com/websocket');
        expect(wsResult.timeout).toBe(30000);
        expect(wsResult.reconnect?.maxAttempts).toBe(5);
      }
    });

    it('should accept minimal WebSocket configuration', () => {
      const minimalConfig = {
        type: 'websocket' as const,
        url: 'wss://api.example.com/websocket',
      };
      expect(() => TransportConfigSchema.parse(minimalConfig)).not.toThrow();
      const result = TransportConfigSchema.parse(minimalConfig);
      expect(result.type).toBe('websocket');
      if (result.type === 'websocket') {
        const wsResult = result as WebSocketTransportConfigZod;
        expect(wsResult.url).toBe('wss://api.example.com/websocket');
        expect(wsResult.timeout).toBeUndefined();
        expect(wsResult.reconnect).toBeUndefined();
      }
    });

    it('should accept partial reconnect configuration', () => {
      const partialReconnectConfig = {
        type: 'websocket' as const,
        url: 'ws://api.example.com/websocket',
        reconnect: {
          maxAttempts: 3,
          // Other fields optional
        },
      };
      expect(() =>
        TransportConfigSchema.parse(partialReconnectConfig),
      ).not.toThrow();
      const result = TransportConfigSchema.parse(partialReconnectConfig);
      if (result.type === 'websocket') {
        const wsResult = result as WebSocketTransportConfigZod;
        expect(wsResult.reconnect?.maxAttempts).toBe(3);
        expect(wsResult.reconnect?.initialDelayMs).toBeUndefined();
      }
    });

    it('should reject WebSocket config without URL', () => {
      const invalidConfig = {
        type: 'websocket' as const,
        // Missing URL
      };
      expect(() => TransportConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject WebSocket config with invalid URL type', () => {
      const invalidConfig = {
        type: 'websocket' as const,
        url: 123, // Should be string
      };
      expect(() => TransportConfigSchema.parse(invalidConfig)).toThrow();
    });
  });

  describe('Invalid transport type discrimination', () => {
    it('should reject unknown transport types', () => {
      const invalidTransportConfig = {
        type: 'unknown-transport',
        url: 'ws://example.com',
      };

      expect(() =>
        TransportConfigSchema.parse(invalidTransportConfig),
      ).toThrow();
    });

    it('should reject transport config without type', () => {
      const noTypeConfig = {
        command: 'some-command',
      };

      expect(() => TransportConfigSchema.parse(noTypeConfig)).toThrow();
    });
  });
});
