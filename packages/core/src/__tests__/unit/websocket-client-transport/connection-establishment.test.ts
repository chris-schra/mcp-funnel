/**
 * Tests for WebSocket Connection Establishment
 *
 * Tests WebSocket setup with proper headers and protocols.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { ClientOptions } from 'ws';
import type { ClientRequestArgs } from 'http';
import {
  WebSocketClientTransport,
  type WebSocketClientTransportConfig,
} from '../../../transports/index.js';
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

describe('WebSocket Connection Establishment', () => {
  let transport: WebSocketClientTransport;
  let config: WebSocketClientTransportConfig;
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

    config = {
      url: 'ws://localhost:8080/ws',
      timeout: 5000,
    };
    transport = new WebSocketClientTransport(config);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should establish WebSocket connection with proper headers', async () => {
    const promise = transport.start();

    // Simulate connection opening
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });

    await promise;
    expect(vi.mocked(WebSocket)).toHaveBeenCalledWith(
      'ws://localhost:8080/ws',
      expect.objectContaining({
        headers: {},
        handshakeTimeout: 5000,
      }),
    );
  });

  it('should close WebSocket with specific close code', async () => {
    await transport.start();

    // Wait for connection to be established
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
    });

    const closeSpy = vi.spyOn(mockWs, 'close');
    await transport.close();

    expect(closeSpy).toHaveBeenCalledWith(1000, 'Transport closed');
  });
});
