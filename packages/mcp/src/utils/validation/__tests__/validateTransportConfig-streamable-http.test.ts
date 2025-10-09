import { describe, it, expect } from 'vitest';
import { validateTransportConfig } from '../validateTransportConfig.js';
import type { StreamableHTTPTransportConfig, TransportConfig } from '@mcp-funnel/models';

describe('validateTransportConfig - StreamableHTTP transport', () => {
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

  it('should throw for unsupported transport type', () => {
    // Type assertion to test exhaustive check with invalid type
    const config = {
      type: 'unknown-transport',
    } as unknown as TransportConfig;

    expect(() => validateTransportConfig(config)).toThrow('Unsupported transport type');
  });
});
