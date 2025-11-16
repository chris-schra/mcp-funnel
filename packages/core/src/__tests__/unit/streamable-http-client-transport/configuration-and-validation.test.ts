/**
 * Configuration and Validation tests for StreamableHTTPClientTransport
 */

// IMPORTANT: Import test-utils first to set up mocks before other imports
import { setupTestEnvironment, type MockAuthProvider } from './test-utils.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamableHTTPClientTransport } from '../../../transports/implementations/streamable-http-client-transport.js';
import { TransportError } from '../../../transports/errors/transport-error.js';

describe('StreamableHTTPClientTransport - Configuration and Validation', () => {
  let mockAuthProvider: MockAuthProvider;

  beforeEach(() => {
    mockAuthProvider = setupTestEnvironment();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should accept valid HTTP URL', () => {
    expect(() => {
      new StreamableHTTPClientTransport({
        url: 'http://localhost:8080/api',
      });
    }).not.toThrow();
  });

  it('should accept valid HTTPS URL', () => {
    expect(() => {
      new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
      });
    }).not.toThrow();
  });

  it('should reject invalid URL', () => {
    expect(() => {
      new StreamableHTTPClientTransport({
        url: 'invalid-url',
      });
    }).toThrow(TransportError);
  });

  it('should reject WebSocket URLs', () => {
    expect(() => {
      new StreamableHTTPClientTransport({
        url: 'ws://localhost:8080/ws',
      });
    }).toThrow('StreamableHTTP URL must use http: or https: protocol');
  });

  it('should apply default timeout', () => {
    const transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
    });

    expect(transport).toBeDefined();
    // Timeout is applied internally - we just verify transport is created successfully
  });

  it('should accept custom timeout', () => {
    const transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
      timeout: 60000,
    });

    expect(transport).toBeDefined();
  });

  it('should accept session ID', () => {
    const transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
      sessionId: 'test-session-123',
    });

    expect(transport).toBeDefined();
  });

  it('should accept auth provider', () => {
    const transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
      authProvider: mockAuthProvider,
    });

    expect(transport).toBeDefined();
  });

  it('should accept reconnect configuration', () => {
    const transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
      reconnect: {
        maxAttempts: 5,
        initialDelayMs: 2000,
        maxDelayMs: 60000,
        backoffMultiplier: 3,
      },
    });

    expect(transport).toBeDefined();
  });
});
