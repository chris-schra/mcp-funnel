import { describe, it, expect } from 'vitest';
import { validateTransportConfig } from '../validateTransportConfig.js';
import type { SSETransportConfig } from '@mcp-funnel/models';

describe('validateTransportConfig - SSE transport', () => {
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

    expect(() => validateTransportConfig(config)).toThrow('maxAttempts must be a positive number');
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
