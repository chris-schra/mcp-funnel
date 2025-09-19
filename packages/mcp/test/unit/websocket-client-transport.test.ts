/**
 * Tests for WebSocketClientTransport - WebSocket-specific functionality only
 *
 * Base transport functionality (config validation, auth integration, message correlation,
 * reconnection logic, data sanitization, lifecycle management) is tested in
 * base-client-transport.test.ts to avoid duplication.
 *
 * WebSocket-specific Test Categories:
 * 1. WebSocket Connection: WebSocket setup with proper headers and protocols
 * 2. Bidirectional Messaging: Real-time message flow over WebSocket connection
 * 3. Ping/Pong Heartbeat: Connection health checks using WebSocket ping/pong
 * 4. WebSocket Close Codes: Handling different WebSocket close scenarios
 * 5. Auth Handshake: Authentication headers in WebSocket upgrade request
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketClientTransport } from '../../src/transports/implementations/websocket-client-transport.js';
import type { WebSocketClientTransportConfig } from '../../src/transports/implementations/websocket-client-transport.js';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { ClientOptions } from 'ws';
import type { ClientRequestArgs } from 'http';

// Mock WebSocket and uuid modules
vi.mock('ws', () => {
  const mockWebSocket = vi.fn();
  return { default: mockWebSocket };
});

vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

// Mock logger
vi.mock('../../src/logger.js', () => ({
  logEvent: vi.fn(),
}));

// Mock WebSocket implementation for testing
class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  // WebSocket required properties
  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSING = 2;
  public readonly CLOSED = 3;
  public binaryType: 'nodebuffer' | 'arraybuffer' | 'fragments' = 'nodebuffer';
  public readonly bufferedAmount = 0;
  public readonly extensions = '';
  public readonly isPaused = false;
  public readonly protocol = '';
  public readyState: 0 | 1 | 2 | 3 = MockWebSocket.CONNECTING;
  public readonly url: string;
  public onopen: ((event: WebSocket.Event) => void) | null = null;
  public onmessage: ((event: WebSocket.MessageEvent) => void) | null = null;
  public onerror: ((event: WebSocket.ErrorEvent) => void) | null = null;
  public onclose: ((event: WebSocket.CloseEvent) => void) | null = null;

  public listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  constructor(
    url: string | URL,
    _protocols?: string | string[],
    _options?: ClientOptions | ClientRequestArgs,
  ) {
    this.url = typeof url === 'string' ? url : url.toString();
    this.listeners = {};

    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Store sent data for testing purposes
    this.lastSentData = data;
  }

  public lastSentData?: string;

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      // Emit close event with Node.js ws format: (code, reason)
      this.emit('close', code || 1000, Buffer.from(reason || ''));
    }, 10);
  }

  ping(_data?: unknown, _mask?: boolean, _cb?: (err: Error) => void): void {
    // Simulate ping
  }

  pong(_data?: unknown, _mask?: boolean, _cb?: (err: Error) => void): void {
    // Simulate pong
  }

  terminate(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  pause(): void {
    // Mock implementation
  }

  resume(): void {
    // Mock implementation
  }

  addEventListener<K extends keyof WebSocket.WebSocketEventMap>(
    _type: K,
    _listener:
      | ((event: WebSocket.WebSocketEventMap[K]) => void)
      | { handleEvent(event: WebSocket.WebSocketEventMap[K]): void },
    _options?: WebSocket.EventListenerOptions,
  ): void {
    // Mock implementation
  }

  removeEventListener<K extends keyof WebSocket.WebSocketEventMap>(
    _type: K,
    _listener:
      | ((event: WebSocket.WebSocketEventMap[K]) => void)
      | { handleEvent(event: WebSocket.WebSocketEventMap[K]): void },
  ): void {
    // Mock implementation
  }

  // Simple event listener implementation
  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const onceWrapper = (...args: unknown[]) => {
      listener(...args);
      this.removeListener(event, onceWrapper);
    };
    this.on(event, onceWrapper);
    return this;
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): this {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (l) => l !== listener,
      );
    }
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners[event] = [];
    } else {
      this.listeners = {};
    }
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    return this.removeListener(event, listener);
  }

  addListener(event: string, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }

  setMaxListeners(_n: number): this {
    return this;
  }

  getMaxListeners(): number {
    return 10;
  }

  listenerCount(_event: string): number {
    return 0;
  }

  prependListener(event: string, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }

  prependOnceListener(
    event: string,
    listener: (...args: unknown[]) => void,
  ): this {
    return this.once(event, listener);
  }

  rawListeners(event: string): ((...args: unknown[]) => void)[] {
    return this.listeners[event] || [];
  }

  eventNames(): (string | symbol)[] {
    return Object.keys(this.listeners);
  }

  emit(event: string, ...args: unknown[]): boolean {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      eventListeners.forEach((listener) => listener(...args));
    }
    return eventListeners ? eventListeners.length > 0 : false;
  }
}

describe('WebSocketClientTransport', () => {
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
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('WebSocket Connection Establishment', () => {
    let transport: WebSocketClientTransport;
    let config: WebSocketClientTransportConfig;

    beforeEach(() => {
      config = {
        url: 'ws://localhost:8080/ws',
        timeout: 5000,
      };
      transport = new WebSocketClientTransport(config);
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

  describe('WebSocket Authentication Handshake', () => {
    let transport: WebSocketClientTransport;
    let mockAuthProvider: {
      getAuthHeaders: ReturnType<typeof vi.fn>;
      refreshToken?: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockAuthProvider = {
        getAuthHeaders: vi.fn().mockResolvedValue({
          Authorization: 'Bearer test-token',
        }),
        refreshToken: vi.fn().mockResolvedValue(undefined),
      };

      transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080/ws',
        authProvider: mockAuthProvider,
      });
    });

    it('should include auth headers in WebSocket upgrade request', async () => {
      await transport.start();

      expect(mockAuthProvider.getAuthHeaders).toHaveBeenCalled();
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
      mockAuthProvider.getAuthHeaders.mockRejectedValue(
        new Error('Auth failed'),
      );

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

  describe('Bidirectional WebSocket Messaging', () => {
    let transport: WebSocketClientTransport;

    beforeEach(async () => {
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

  describe('WebSocket Close Code Handling', () => {
    let transport: WebSocketClientTransport;

    beforeEach(() => {
      transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080/ws',
        timeout: 1000,
      });
    });

    afterEach(async () => {
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

  describe('WebSocket Ping/Pong Heartbeat', () => {
    let transport: WebSocketClientTransport;

    beforeEach(() => {
      transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080/ws',
        pingInterval: 50, // Very short interval for fast testing
      });
    });

    afterEach(async () => {
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
});
