/**
 * Tests for WebSocket Authentication Handshake
 *
 * Tests authentication headers in WebSocket upgrade request.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

describe('WebSocket Authentication Handshake', () => {
  let transport: WebSocketClientTransport;
  let mockAuthProvider: {
    getHeaders: ReturnType<typeof vi.fn>;
    refresh?: ReturnType<typeof vi.fn>;
    isValid: ReturnType<typeof vi.fn>;
  };
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

    mockAuthProvider = {
      getHeaders: vi.fn().mockResolvedValue({
        Authorization: 'Bearer test-token',
      }),
      refresh: vi.fn().mockResolvedValue(undefined),
      isValid: vi.fn().mockResolvedValue(true),
    };

    transport = new WebSocketClientTransport({
      url: 'ws://localhost:8080/ws',
      authProvider: mockAuthProvider,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should include auth headers in WebSocket upgrade request', async () => {
    await transport.start();

    expect(mockAuthProvider.getHeaders).toHaveBeenCalled();
    expect(vi.mocked(WebSocket)).toHaveBeenCalledWith(
      'ws://localhost:8080/ws',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
        },
      }),
    );
  });

  it('should handle authentication failure during WebSocket handshake', async () => {
    mockAuthProvider.getHeaders.mockRejectedValue(new Error('Auth failed'));

    const errorSpy = vi.fn();
    transport.onerror = errorSpy;

    await transport.start();

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Authentication failed'),
        }),
      );
    });
  });
});
