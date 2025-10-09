/**
 * Tests for WebSocket Ping/Pong Heartbeat
 *
 * Tests connection health checks using WebSocket ping/pong.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('WebSocket Ping/Pong Heartbeat', () => {
  let transport: WebSocketClientTransport;
  let mockWs: MockWebSocket;
  let uuidCounter = 0;

  beforeEach(() => {
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
      pingInterval: 50, // Very short interval for fast testing
    });
  });

  afterEach(async () => {
    vi.clearAllTimers();
    await transport.close();
  });

  it('should initiate ping frames to maintain connection', async () => {
    const pingSpy = vi.spyOn(MockWebSocket.prototype, 'ping');

    await transport.start();

    // Wait for connection to be established
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });

    // Wait for ping to be called
    await vi.waitFor(
      () => {
        expect(pingSpy).toHaveBeenCalled();
      },
      { timeout: 150 },
    );
  });

  it('should handle pong responses from server', async () => {
    await transport.start();

    // Wait for connection
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });

    // Emit pong response
    mockWs.emit('pong', Buffer.from('heartbeat'));

    // Should handle pong without errors
    expect(transport).toBeDefined();
  });

  it('should stop heartbeat when connection closes', async () => {
    const pingSpy = vi.spyOn(MockWebSocket.prototype, 'ping');

    await transport.start();

    // Wait for connection and at least one ping
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });

    await vi.waitFor(() => {
      expect(pingSpy).toHaveBeenCalled();
    });

    const initialCallCount = pingSpy.mock.calls.length;
    await transport.close();

    // Wait to ensure no more pings are sent
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(pingSpy.mock.calls.length).toBe(initialCallCount);
  });

  it('should send ping with proper WebSocket frame', async () => {
    const pingSpy = vi.spyOn(MockWebSocket.prototype, 'ping');

    await transport.start();

    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });

    await vi.waitFor(() => {
      expect(pingSpy).toHaveBeenCalledWith();
    });
  });
});
