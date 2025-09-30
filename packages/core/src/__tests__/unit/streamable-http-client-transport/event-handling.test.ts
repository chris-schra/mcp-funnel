/**
 * Event Handling tests for StreamableHTTPClientTransport
 */

// IMPORTANT: Import test-utils first to set up mocks before other imports
import { setupTestEnvironment, mockSDKTransport } from './test-utils.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPClientTransport } from '../../../transports/implementations/streamable-http-client-transport.js';

describe('StreamableHTTPClientTransport - Event Handling', () => {
  let transport: StreamableHTTPClientTransport;

  beforeEach(() => {
    setupTestEnvironment();
    transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should handle SDK onmessage event', () => {
    const onMessage = vi.fn();
    transport.onmessage = onMessage;

    const message: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: 'test',
      result: {},
    };
    mockSDKTransport.onmessage?.(message);

    expect(onMessage).toHaveBeenCalledWith(message);
  });

  it('should handle SDK onerror event', () => {
    const onError = vi.fn();
    transport.onerror = onError;

    const error = new Error('Test error');
    mockSDKTransport.onerror?.(error);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('should handle SDK onclose event when transport is closed', async () => {
    const onClose = vi.fn();
    transport.onclose = onClose;

    // Close transport - this should trigger onclose callback
    mockSDKTransport.close.mockResolvedValue(undefined);
    await transport.close();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should not trigger onclose when transport is not closed', () => {
    const onClose = vi.fn();
    transport.onclose = onClose;

    // Trigger SDK onclose without closing transport first
    mockSDKTransport.onclose?.();

    expect(onClose).not.toHaveBeenCalled();
  });
});
