/**
 * Tests for Bidirectional WebSocket Messaging
 *
 * Tests real-time message flow over WebSocket connection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { ClientOptions } from 'ws';
import type { ClientRequestArgs } from 'http';
import { WebSocketClientTransport } from '../../../transports/index.js';
import { MockWebSocket } from './test-utils.js';

// Mock WebSocket and uuid modules
vi.mock('ws', () => {
  const mockWebSocket = vi.fn();
  return { default: mockWebSocket };
});

vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

// Mock logger
vi.mock('../../../logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../logger.js')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

describe('Bidirectional WebSocket Messaging', () => {
  let transport: WebSocketClientTransport;
  let mockWs: MockWebSocket;
  let uuidCounter = 0;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset UUID counter and setup mock
    uuidCounter = 0;
    (uuidv4 as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => `test-uuid-${++uuidCounter}`,
    );

    // Setup WebSocket mock
    vi.mocked(WebSocket).mockImplementation(
      (
        url: string | URL,
        protocols?: string | string[],
        options?: ClientOptions | ClientRequestArgs,
      ) => {
        mockWs = new MockWebSocket(url, protocols, options);
        return mockWs as unknown as WebSocket;
      },
    );

    // Set static properties using Object.assign to avoid readonly errors
    Object.assign(WebSocket, {
      CONNECTING: MockWebSocket.CONNECTING,
      OPEN: MockWebSocket.OPEN,
      CLOSING: MockWebSocket.CLOSING,
      CLOSED: MockWebSocket.CLOSED,
    });

    transport = new WebSocketClientTransport({
      url: 'ws://localhost:8080/ws',
      timeout: 1000,
    });

    await transport.start();

    // Wait for connection to be established
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });
  });

  afterEach(async () => {
    vi.clearAllTimers();
    await transport.close();
  });

  it('should send messages over WebSocket connection', async () => {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method: 'test/method',
      id: 'ws-test-id',
      params: { key: 'value' },
    };

    // Start the send but don't wait for it to complete (would timeout waiting for response)
    const sendPromise = transport.send(request);

    // Wait for WebSocket send to be called
    await vi.waitFor(() => {
      expect(mockWs.lastSentData).toBeDefined();
    });

    const sentMessage = JSON.parse(mockWs.lastSentData!);
    expect(sentMessage).toEqual(request);

    // Clean up - this will timeout but we don't wait for it
    sendPromise.catch(() => {
      // Expected timeout since mock doesn't respond with JSON-RPC
    });
  });

  it('should receive messages from WebSocket connection', async () => {
    const onMessageSpy = vi.fn();
    transport.onmessage = onMessageSpy;

    const incomingMessage = {
      jsonrpc: '2.0',
      method: 'server/notification',
      params: { data: 'from-server' },
    };

    // Simulate incoming message - Node.js ws emits Buffer data
    mockWs.emit('message', Buffer.from(JSON.stringify(incomingMessage)));

    await vi.waitFor(() => {
      expect(onMessageSpy).toHaveBeenCalledWith(incomingMessage);
    });
  });

  it('should handle WebSocket connection errors', async () => {
    const onErrorSpy = vi.fn();
    transport.onerror = onErrorSpy;

    const error = new Error('WebSocket connection failed');
    mockWs.emit('error', error);

    await vi.waitFor(() => {
      expect(onErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('WebSocket error'),
        }),
      );
    });
  });
});
