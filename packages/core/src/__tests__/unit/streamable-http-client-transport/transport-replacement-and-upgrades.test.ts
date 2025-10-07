/**
 * Transport Replacement and Upgrades tests for StreamableHTTPClientTransport
 */

// IMPORTANT: Import test-utils first to set up mocks before other imports
import { setupTestEnvironment, mockSDKTransport, type MockAuthProvider } from './test-utils.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamableHTTPClientTransport } from '../../../transports/implementations/streamable-http-client-transport.js';

describe('StreamableHTTPClientTransport - Transport Replacement and Upgrades', () => {
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

  it('should preserve auth headers during transport upgrade', async () => {
    // Start transport to establish auth headers
    mockSDKTransport.start.mockResolvedValue(undefined);
    mockSDKTransport.sessionId = 'session-123';
    await transport.start();

    // Verify auth headers were retrieved and stored
    expect(mockAuthProvider.getHeaders).toHaveBeenCalledOnce();

    // Upgrade transport
    await transport.upgradeTransport('websocket');

    // Should have created new transport with preserved auth headers
    // The createSDKTransport should be called with auth headers included
    expect(mockSDKTransport.start).toHaveBeenCalledTimes(2); // Once for initial start, once for upgrade
  });

  it('should properly close old transport during upgrade', async () => {
    mockSDKTransport.start.mockResolvedValue(undefined);
    mockSDKTransport.close.mockResolvedValue(undefined);
    await transport.start();

    // Reset the close mock after start to track only upgrade calls
    mockSDKTransport.close.mockClear();

    await transport.upgradeTransport('sse');

    // Old transport should have been closed during upgrade
    expect(mockSDKTransport.close).toHaveBeenCalledOnce();
  });

  it('should handle transport upgrade when not started', async () => {
    // Upgrade without starting first
    await transport.upgradeTransport('websocket');

    // Should not try to start the new transport since original wasn't started
    expect(mockSDKTransport.start).not.toHaveBeenCalled();
  });

  it('should throw error when upgrading closed transport', async () => {
    mockSDKTransport.close.mockResolvedValue(undefined);
    await transport.close();

    await expect(transport.upgradeTransport('websocket')).rejects.toThrow(
      'Cannot upgrade closed transport',
    );
  });

  it('should preserve session ID after upgrade', async () => {
    mockSDKTransport.start.mockResolvedValue(undefined);
    mockSDKTransport.sessionId = 'initial-session';
    await transport.start();

    expect(transport.sessionId).toBe('initial-session');

    // After upgrade, should get new session ID
    mockSDKTransport.sessionId = 'upgraded-session';
    await transport.upgradeTransport('sse');

    expect(transport.sessionId).toBe('upgraded-session');
  });

  it('should handle errors during old transport cleanup gracefully', async () => {
    mockSDKTransport.start.mockResolvedValue(undefined);
    await transport.start();

    // Make old transport close throw an error
    mockSDKTransport.close.mockRejectedValue(new Error('Close failed'));

    // Upgrade should still succeed despite cleanup error
    await expect(transport.upgradeTransport('websocket')).resolves.not.toThrow();
  });

  it('should setup callbacks on new transport after replacement', async () => {
    mockSDKTransport.start.mockResolvedValue(undefined);
    await transport.start();

    const onMessage = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();

    transport.onmessage = onMessage;
    transport.onerror = onError;
    transport.onclose = onClose;

    await transport.upgradeTransport('websocket');

    // Callbacks should be set up on the new transport
    expect(mockSDKTransport.onmessage).toBeDefined();
    expect(mockSDKTransport.onerror).toBeDefined();
    expect(mockSDKTransport.onclose).toBeDefined();
  });
});
