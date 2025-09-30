/**
 * Auth Header Preservation tests for StreamableHTTPClientTransport
 */

// IMPORTANT: Import test-utils first to set up mocks before other imports
import {
  setupTestEnvironment,
  mockSDKTransport,
  type MockAuthProvider,
} from './test-utils.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamableHTTPClientTransport } from '../../../transports/implementations/streamable-http-client-transport.js';

describe('StreamableHTTPClientTransport - Auth Header Preservation', () => {
  let transport: StreamableHTTPClientTransport;
  let mockAuthProvider: MockAuthProvider;

  beforeEach(() => {
    mockAuthProvider = setupTestEnvironment();
    transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
      authProvider: mockAuthProvider,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should store auth headers during start', async () => {
    const authHeaders = {
      Authorization: 'Bearer test-token',
      'X-API-Key': 'key123',
    };
    mockAuthProvider.getHeaders.mockResolvedValue(authHeaders);
    mockSDKTransport.start.mockResolvedValue(undefined);

    await transport.start();

    expect(mockAuthProvider.getHeaders).toHaveBeenCalledOnce();
    // Auth headers should be stored internally for later use
  });

  it('should use stored auth headers during upgrade', async () => {
    const authHeaders = { Authorization: 'Bearer test-token' };
    mockAuthProvider.getHeaders.mockResolvedValue(authHeaders);
    mockSDKTransport.start.mockResolvedValue(undefined);

    await transport.start();

    // Clear the mock to ensure it's not called again during upgrade
    mockAuthProvider.getHeaders.mockClear();

    await transport.upgradeTransport('websocket');

    // Auth provider should not be called again - stored headers should be used
    expect(mockAuthProvider.getHeaders).not.toHaveBeenCalled();
  });

  it('should start without auth headers when no auth provider', async () => {
    const noAuthTransport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
    });

    mockSDKTransport.start.mockResolvedValue(undefined);

    await noAuthTransport.start();

    expect(mockSDKTransport.start).toHaveBeenCalledOnce();
    // Should not have tried to get auth headers
    expect(mockAuthProvider.getHeaders).not.toHaveBeenCalled();
  });
});
