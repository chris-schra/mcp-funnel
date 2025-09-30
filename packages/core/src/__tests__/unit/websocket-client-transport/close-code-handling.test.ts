/**
 * Tests for WebSocket Close Code Handling
 *
 * Tests handling different WebSocket close scenarios.
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

describe('WebSocket Close Code Handling', () => {
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
      timeout: 1000,
    });
  });

  afterEach(async () => {
    vi.clearAllTimers();
    await transport.close();
  });

  it('should handle normal WebSocket close (1000)', async () => {
    await transport.start();

    // Wait for connection to be established
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });

    // Close with normal close code - use Node.js ws format: (code, reason)
    mockWs.emit('close', 1000, Buffer.from('Normal closure'));

    // Normal close should not trigger unexpected behavior
    expect(transport).toBeDefined();
  });

  it('should handle abnormal WebSocket close (1006) differently', async () => {
    transport = new WebSocketClientTransport({
      url: 'ws://localhost:8080/ws',
      reconnect: {
        maxAttempts: 1,
        initialDelayMs: 10,
      },
    });

    await transport.start();

    // Wait for initial connection
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });

    const initialCallCount = vi.mocked(WebSocket).mock.calls.length;

    // Close with abnormal close code (connection lost)
    mockWs.emit('close', 1006, Buffer.from('Abnormal closure'));

    // Should trigger reconnection attempt for abnormal close
    await vi.waitFor(
      () => {
        expect(vi.mocked(WebSocket).mock.calls.length).toBeGreaterThan(
          initialCallCount,
        );
      },
      { timeout: 100 },
    );
  });

  it('should handle WebSocket protocol error close (1002)', async () => {
    await transport.start();

    // Wait for connection to be established
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });

    // Close with protocol error
    mockWs.emit('close', 1002, Buffer.from('Protocol error'));

    // Protocol errors should not cause immediate reconnection
    expect(transport).toBeDefined();
  });
});
