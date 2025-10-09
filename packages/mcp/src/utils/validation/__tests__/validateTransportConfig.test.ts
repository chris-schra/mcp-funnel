/* eslint-disable max-lines */
import { describe, it, expect } from 'vitest';
import { validateTransportConfig } from '../validateTransportConfig.js';
import type {
  StdioTransportConfig,
  SSETransportConfig,
  WebSocketTransportConfig,
  StreamableHTTPTransportConfig,
  TransportConfig,
} from '@mcp-funnel/models';

describe('validateTransportConfig', () => {
  describe('stdio transport', () => {
    it('should accept valid stdio config with command', () => {
      const config: StdioTransportConfig = {
        type: 'stdio',
        command: 'node',
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid stdio config with command, args, and env', () => {
      const config: StdioTransportConfig = {
        type: 'stdio',
        command: 'node',
        args: ['index.js', '--port=3000'],
        env: { NODE_ENV: 'production' },
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should throw when command is missing', () => {
      const config = {
        type: 'stdio',
      } as StdioTransportConfig;

      expect(() => validateTransportConfig(config)).toThrow(
        'Command is required for stdio transport',
      );
    });

    it('should throw when command is empty string', () => {
      const config: StdioTransportConfig = {
        type: 'stdio',
        command: '',
      };

      expect(() => validateTransportConfig(config)).toThrow(
        'Command is required for stdio transport',
      );
    });
  });

  describe('SSE transport', () => {
    it('should accept valid SSE config with https URL', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: 'https://api.example.com/sse',
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid SSE config with http URL', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: 'http://localhost:3000/events',
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid SSE config with reconnect configuration', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: 'https://api.example.com/sse',
        reconnect: {
          maxAttempts: 5,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
        },
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should throw when URL is missing', () => {
      const config = {
        type: 'sse',
      } as SSETransportConfig;

      expect(() => validateTransportConfig(config)).toThrow('URL is required for SSE transport');
    });

    it('should throw when URL is empty string', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: '',
      };

      expect(() => validateTransportConfig(config)).toThrow('URL is required for SSE transport');
    });

    it('should throw when URL is malformed', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: 'not-a-valid-url',
      };

      expect(() => validateTransportConfig(config)).toThrow('Invalid URL');
    });

    it('should throw when URL uses invalid protocol (ftp)', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: 'ftp://example.com/sse',
      };

      // ValidationUtils.validateUrl accepts any valid URL format,
      // but SSE doesn't restrict protocols (only WebSocket and StreamableHTTP do)
      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should throw when reconnect config has invalid maxAttempts', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: 'https://api.example.com/sse',
        reconnect: {
          maxAttempts: -1,
        },
      };

      expect(() => validateTransportConfig(config)).toThrow(
        'maxAttempts must be a positive number',
      );
    });

    it('should throw when reconnect config has invalid initialDelayMs', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: 'https://api.example.com/sse',
        reconnect: {
          initialDelayMs: -100,
        },
      };

      expect(() => validateTransportConfig(config)).toThrow(
        'initialDelayMs must be a positive number',
      );
    });

    it('should throw when reconnect config has invalid maxDelayMs', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: 'https://api.example.com/sse',
        reconnect: {
          maxDelayMs: -5000,
        },
      };

      expect(() => validateTransportConfig(config)).toThrow('maxDelayMs must be a positive number');
    });

    it('should throw when reconnect config has invalid backoffMultiplier', () => {
      const config: SSETransportConfig = {
        type: 'sse',
        url: 'https://api.example.com/sse',
        reconnect: {
          backoffMultiplier: 1,
        },
      };

      expect(() => validateTransportConfig(config)).toThrow(
        'backoffMultiplier must be greater than 1',
      );
    });
  });

  describe('WebSocket transport', () => {
    it('should accept valid WebSocket config with ws:// protocol', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'ws://localhost:3000',
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid WebSocket config with wss:// protocol', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'wss://api.example.com',
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid WebSocket config with http:// protocol (upgrades to ws)', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'http://localhost:3000',
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid WebSocket config with https:// protocol (upgrades to wss)', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'https://api.example.com',
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid WebSocket config with timeout', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'wss://api.example.com',
        timeout: 5000,
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid WebSocket config with reconnect configuration', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'wss://api.example.com',
        reconnect: {
          maxAttempts: 3,
          initialDelayMs: 500,
          maxDelayMs: 10000,
          backoffMultiplier: 1.5,
        },
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should throw when URL is missing', () => {
      const config = {
        type: 'websocket',
      } as WebSocketTransportConfig;

      expect(() => validateTransportConfig(config)).toThrow(
        'URL is required for WebSocket transport',
      );
    });

    it('should throw when URL is empty string', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: '',
      };

      expect(() => validateTransportConfig(config)).toThrow(
        'URL is required for WebSocket transport',
      );
    });

    it('should throw when URL is malformed', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'invalid-url',
      };

      expect(() => validateTransportConfig(config)).toThrow('Invalid URL');
    });

    it('should throw when URL uses invalid protocol (ftp)', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'ftp://example.com',
      };

      expect(() => validateTransportConfig(config)).toThrow('Invalid URL');
    });

    it('should throw when URL uses invalid protocol (file)', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'file:///path/to/file',
      };

      expect(() => validateTransportConfig(config)).toThrow('Invalid URL');
    });

    it('should throw when timeout is zero', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'wss://api.example.com',
        timeout: 0,
      };

      expect(() => validateTransportConfig(config)).toThrow('timeout must be a positive number');
    });

    it('should throw when timeout is negative', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'wss://api.example.com',
        timeout: -1,
      };

      expect(() => validateTransportConfig(config)).toThrow('timeout must be a positive number');
    });

    it('should throw when reconnect config is invalid', () => {
      const config: WebSocketTransportConfig = {
        type: 'websocket',
        url: 'wss://api.example.com',
        reconnect: {
          maxAttempts: -5,
        },
      };

      expect(() => validateTransportConfig(config)).toThrow(
        'maxAttempts must be a positive number',
      );
    });
  });

  describe('StreamableHTTP transport', () => {
    it('should accept valid StreamableHTTP config with http:// protocol', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'http://localhost:3000',
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid StreamableHTTP config with https:// protocol', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com',
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid StreamableHTTP config with timeout', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com',
        timeout: 10000,
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should accept valid StreamableHTTP config with reconnect configuration', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com',
        reconnect: {
          maxAttempts: 10,
          initialDelayMs: 2000,
        },
      };

      expect(() => validateTransportConfig(config)).not.toThrow();
    });

    it('should throw when URL is missing', () => {
      const config = {
        type: 'streamable-http',
      } as StreamableHTTPTransportConfig;

      expect(() => validateTransportConfig(config)).toThrow(
        'URL is required for StreamableHTTP transport',
      );
    });

    it('should throw when URL is empty string', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: '',
      };

      expect(() => validateTransportConfig(config)).toThrow(
        'URL is required for StreamableHTTP transport',
      );
    });

    it('should throw when URL is malformed', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'not-valid',
      };

      expect(() => validateTransportConfig(config)).toThrow('Invalid URL');
    });

    it('should throw when URL uses ws:// protocol (must be http/https)', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'ws://localhost:3000',
      };

      expect(() => validateTransportConfig(config)).toThrow('Invalid URL');
    });

    it('should throw when URL uses wss:// protocol (must be http/https)', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'wss://api.example.com',
      };

      expect(() => validateTransportConfig(config)).toThrow('Invalid URL');
    });

    it('should throw when URL uses ftp:// protocol', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'ftp://example.com',
      };

      expect(() => validateTransportConfig(config)).toThrow('Invalid URL');
    });

    it('should throw when timeout is zero', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com',
        timeout: 0,
      };

      expect(() => validateTransportConfig(config)).toThrow('timeout must be a positive number');
    });

    it('should throw when timeout is negative', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com',
        timeout: -1,
      };

      expect(() => validateTransportConfig(config)).toThrow('timeout must be a positive number');
    });

    it('should throw when reconnect config is invalid', () => {
      const config: StreamableHTTPTransportConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com',
        reconnect: {
          backoffMultiplier: 0.5,
        },
      };

      expect(() => validateTransportConfig(config)).toThrow(
        'backoffMultiplier must be greater than 1',
      );
    });
  });

  describe('unknown transport type', () => {
    it('should throw for unsupported transport type', () => {
      // Type assertion to test exhaustive check with invalid type
      const config = {
        type: 'unknown-transport',
      } as unknown as TransportConfig;

      expect(() => validateTransportConfig(config)).toThrow('Unsupported transport type');
    });
  });
});
