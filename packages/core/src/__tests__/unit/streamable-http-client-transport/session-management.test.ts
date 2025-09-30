/**
 * Session Management tests for StreamableHTTPClientTransport
 */

// IMPORTANT: Import test-utils first to set up mocks before other imports
import { setupTestEnvironment, mockSDKTransport } from './test-utils.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamableHTTPClientTransport } from '../../../transports/implementations/streamable-http-client-transport.js';

describe('StreamableHTTPClientTransport - Session Management', () => {
  let transport: StreamableHTTPClientTransport;

  beforeEach(() => {
    setupTestEnvironment();
    transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
      sessionId: 'initial-session',
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should terminate session', async () => {
    mockSDKTransport.terminateSession.mockResolvedValue(undefined);

    await transport.terminateSession();

    expect(mockSDKTransport.terminateSession).toHaveBeenCalledOnce();
  });

  it('should handle session termination failure', async () => {
    const error = new Error('Termination failed');
    mockSDKTransport.terminateSession.mockRejectedValue(error);

    await expect(transport.terminateSession()).rejects.toThrow(error);
  });

  it('should get session ID from SDK transport after start', async () => {
    mockSDKTransport.start.mockResolvedValue(undefined);
    mockSDKTransport.sessionId = 'new-session-123';

    await transport.start();

    expect(transport.sessionId).toBe('new-session-123');
  });

  it('should get protocol version from SDK transport', () => {
    mockSDKTransport.protocolVersion = '2024-11-05';

    expect(transport.protocolVersion).toBe('2024-11-05');
  });

  it('should set protocol version on SDK transport', () => {
    transport.setProtocolVersion?.('2024-11-05');

    expect(mockSDKTransport.setProtocolVersion).toHaveBeenCalledWith(
      '2024-11-05',
    );
  });
});
