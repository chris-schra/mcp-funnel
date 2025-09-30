/**
 * Auth Integration tests for StreamableHTTPClientTransport
 */

// IMPORTANT: Import test-utils first to set up mocks before other imports
import {
  setupTestEnvironment,
  mockSDKTransport,
  type MockAuthProvider,
} from './test-utils.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamableHTTPClientTransport } from '../../../transports/implementations/streamable-http-client-transport.js';
import { TransportError } from '../../../transports/errors/transport-error.js';

describe('StreamableHTTPClientTransport - Auth Integration', () => {
  let mockAuthProvider: MockAuthProvider;

  beforeEach(() => {
    mockAuthProvider = setupTestEnvironment();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should finish OAuth authorization', async () => {
    const transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
      authProvider: mockAuthProvider,
    });

    mockSDKTransport.finishAuth.mockResolvedValue(undefined);

    await transport.finishAuth('auth-code-123');

    expect(mockSDKTransport.finishAuth).toHaveBeenCalledWith('auth-code-123');
  });

  it('should handle OAuth authorization failure', async () => {
    const transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
      authProvider: mockAuthProvider,
    });

    const error = new Error('Auth failed');
    mockSDKTransport.finishAuth.mockRejectedValue(error);

    await expect(transport.finishAuth('auth-code-123')).rejects.toThrow(
      TransportError,
    );
  });
});
