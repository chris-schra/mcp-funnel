/**
 * Connection Management tests for StreamableHTTPClientTransport
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

describe('StreamableHTTPClientTransport - Connection Management', () => {
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

  it('should start connection successfully', async () => {
    mockSDKTransport.start.mockResolvedValue(undefined);
    mockSDKTransport.sessionId = 'session-123';

    await transport.start();

    expect(mockSDKTransport.start).toHaveBeenCalledOnce();
    expect(transport.sessionId).toBe('session-123');
  });

  it('should handle start failure', async () => {
    const error = new Error('Connection failed');
    mockSDKTransport.start.mockRejectedValue(error);

    await expect(transport.start()).rejects.toThrow(TransportError);
  });

  it('should not start twice', async () => {
    mockSDKTransport.start.mockResolvedValue(undefined);

    await transport.start();
    await transport.start(); // Should not call start again

    expect(mockSDKTransport.start).toHaveBeenCalledOnce();
  });

  it('should close connection successfully', async () => {
    mockSDKTransport.close.mockResolvedValue(undefined);

    await transport.close();

    expect(mockSDKTransport.close).toHaveBeenCalledOnce();
  });

  it('should handle close failure', async () => {
    const error = new Error('Close failed');
    mockSDKTransport.close.mockRejectedValue(error);

    await expect(transport.close()).rejects.toThrow(error);
  });

  it('should not close twice', async () => {
    mockSDKTransport.close.mockResolvedValue(undefined);

    await transport.close();
    await transport.close(); // Should not call close again

    expect(mockSDKTransport.close).toHaveBeenCalledOnce();
  });

  it('should throw error when starting closed transport', async () => {
    mockSDKTransport.close.mockResolvedValue(undefined);
    await transport.close();

    await expect(transport.start()).rejects.toThrow(
      'Transport is closed and cannot be restarted',
    );
  });
});
