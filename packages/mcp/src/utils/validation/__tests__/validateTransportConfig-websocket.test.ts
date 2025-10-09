import { describe, it, expect } from 'vitest';
import { validateTransportConfig } from '../validateTransportConfig.js';
import type { WebSocketTransportConfig } from '@mcp-funnel/models';

describe('validateTransportConfig - WebSocket transport', () => {
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

    expect(() => validateTransportConfig(config)).toThrow('maxAttempts must be a positive number');
  });
});
