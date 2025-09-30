/**
 * Error Scenarios tests for StreamableHTTPClientTransport
 */

// IMPORTANT: Import test-utils first to set up mocks before other imports
import { setupTestEnvironment } from './test-utils.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamableHTTPClientTransport } from '../../../transports/implementations/streamable-http-client-transport.js';
import { TransportError } from '../../../transports/errors/transport-error.js';

describe('StreamableHTTPClientTransport - Error Scenarios', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should handle URL construction failure', () => {
    expect(() => {
      new StreamableHTTPClientTransport({
        url: '',
      });
    }).toThrow('URL is required for StreamableHTTP transport');
  });

  it('should handle SDK transport creation failure', () => {
    // Mock URL constructor to throw
    const originalURL = global.URL;
    global.URL = vi.fn().mockImplementation(() => {
      throw new Error('Invalid URL');
    }) as unknown as typeof URL;

    expect(() => {
      new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
      });
    }).toThrow(TransportError);

    // Restore URL constructor
    global.URL = originalURL;
  });
});
