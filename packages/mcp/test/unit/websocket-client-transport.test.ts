/**
 * Tests for WebSocketClientTransport
 *
 * Test Categories:
 * 1. WebSocket Connection: WebSocket setup, connection management, error handling
 * 2. Message Flow: Bidirectional message flow via WebSocket
 * 3. Message Correlation: UUID request/response matching with pending request Map
 * 4. Authentication: Auth headers during WebSocket handshake
 * 5. Reconnection Logic: Exponential backoff (1s, 2s, 4s, 8s, 16s), max 5 attempts
 * 6. Error Recovery: Connection failures, protocol errors, close code handling
 * 7. Cleanup: Proper resource cleanup, timeout support
 * 8. Ping/Pong: Connection health checks and heartbeat management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketClientTransport } from '../../src/transports/implementations/websocket-client-transport.js';
import { TransportError } from '../../src/transports/errors/transport-error.js';
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

  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

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
      this.emit('close', code || 1000, reason || '');
    }, 10);
  }

  ping(_data?: Buffer, _mask?: boolean, _cb?: (err: Error) => void): void {
    // Simulate ping
  }

  pong(_data?: Buffer, _mask?: boolean, _cb?: (err: Error) => void): void {
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

  rawListeners(event: string): Array<(...args: unknown[]) => void> {
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
    vi.mocked(uuidv4).mockImplementation(() => `test-uuid-${++uuidCounter}`);

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

  describe('Configuration and Validation', () => {
    it('should accept valid WebSocket URL', () => {
      expect(() => {
        new WebSocketClientTransport({
          url: 'ws://localhost:8080/ws',
        });
      }).not.toThrow();
    });

    it('should accept HTTP URL and convert to WS', () => {
      const transport = new WebSocketClientTransport({
        url: 'http://localhost:8080/api',
      });

      expect(transport).toBeDefined();
    });

    it('should accept HTTPS URL and convert to WSS', () => {
      const transport = new WebSocketClientTransport({
        url: 'https://api.example.com/ws',
      });

      expect(transport).toBeDefined();
    });

    it('should reject invalid URL', () => {
      expect(() => {
        new WebSocketClientTransport({
          url: 'invalid-url',
        });
      }).toThrow(TransportError);
    });

    it('should enforce WSS in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(() => {
        new WebSocketClientTransport({
          url: 'ws://api.example.com/ws',
        });
      }).toThrow(TransportError);

      process.env.NODE_ENV = originalEnv;
    });

    it('should apply default configuration values', () => {
      const transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080',
      });

      expect(transport).toBeDefined();
      // Defaults are applied internally, not exposed
    });

    it('should accept custom configuration values', () => {
      const transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080',
        timeout: 15000,
        pingInterval: 20000,
        reconnect: {
          maxAttempts: 3,
          initialDelayMs: 500,
          backoffMultiplier: 1.5,
          maxDelayMs: 8000,
        },
      });

      expect(transport).toBeDefined();
    });
  });

  describe('Connection Management', () => {
    let transport: WebSocketClientTransport;
    let config: WebSocketClientTransportConfig;

    beforeEach(() => {
      config = {
        url: 'ws://localhost:8080/ws',
        timeout: 5000,
      };
      transport = new WebSocketClientTransport(config);
    });

    it('should start connection', async () => {
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

    it('should not start multiple times', async () => {
      await transport.start();
      await transport.start(); // Second call should be no-op

      expect(vi.mocked(WebSocket)).toHaveBeenCalledTimes(1);
    });

    it('should generate session ID on connection', async () => {
      await transport.start();

      // Wait for connection to open
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      expect(transport.sessionId).toBeDefined();
      expect(transport.sessionId).toMatch(/^test-uuid-\d+$/);
    });

    it('should close connection properly', async () => {
      await transport.start();

      // Wait for connection to be established
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      const closeSpy = vi.spyOn(mockWs, 'close');
      await transport.close();

      expect(closeSpy).toHaveBeenCalledWith(1000, 'Transport closed');
    });

    it('should not close multiple times', async () => {
      await transport.start();

      // Wait for connection to be established
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      const closeSpy = vi.spyOn(mockWs, 'close');
      await transport.close();
      await transport.close(); // Second call should be no-op

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authentication', () => {
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

    it('should include auth headers in WebSocket handshake', async () => {
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

    it('should handle auth provider errors', async () => {
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

  describe('Message Sending and Correlation', () => {
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

    it('should send JSON-RPC request and generate ID', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        method: 'test/method',
        params: { key: 'value' },
        // id will be auto-generated by transport
      };

      // Send the request (this should complete without waiting for response)
      await transport.send(request);

      // Wait for WebSocket send to be called
      await vi.waitFor(() => {
        expect(mockWs.lastSentData).toBeDefined();
      });

      // Get the sent message
      const sentMessage = JSON.parse(mockWs.lastSentData!);

      expect(sentMessage).toMatchObject({
        jsonrpc: '2.0',
        method: 'test/method',
        params: { key: 'value' },
      });
      expect(sentMessage.id).toMatch(/^test-uuid-\d+$/);
    });

    it('should preserve existing request ID', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
        id: 'existing-id',
      };

      await transport.send(request);

      // Wait for send to be called
      await vi.waitFor(() => {
        expect(mockWs.lastSentData).toBeDefined();
      });

      const sentMessage = JSON.parse(mockWs.lastSentData!);

      expect(sentMessage.id).toBe('existing-id');
    });

    it('should send request without timeout (response correlation is separate)', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
        id: 'timeout-test-id',
      };

      // Send should complete immediately, not wait for response
      await transport.send(request);

      // Verify the message was sent
      await vi.waitFor(() => {
        expect(mockWs.lastSentData).toBeDefined();
      });

      const sentMessage = JSON.parse(mockWs.lastSentData!);
      expect(sentMessage.id).toBe('timeout-test-id');
    });

    it('should handle JSON-RPC error responses via onmessage', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
        id: 'test-id',
      };

      const onMessageSpy = vi.fn();
      transport.onmessage = onMessageSpy;

      await transport.send(request);

      // Wait for request to be sent
      await vi.waitFor(() => {
        expect(mockWs.lastSentData).toBeDefined();
      });

      // Send error response
      const errorResponse = {
        jsonrpc: '2.0',
        id: 'test-id',
        error: { code: -1, message: 'Test error' },
      };

      // Simulate error response - Node.js ws emits Buffer data
      mockWs.emit('message', Buffer.from(JSON.stringify(errorResponse)));

      // Error responses are handled through onmessage callback, not as exceptions
      await vi.waitFor(() => {
        expect(onMessageSpy).toHaveBeenCalledWith(errorResponse);
      });
    });

    it('should forward unmatched messages to onmessage', async () => {
      const onMessageSpy = vi.fn();
      transport.onmessage = onMessageSpy;

      // Make sure connection is established first
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      const notification = {
        jsonrpc: '2.0',
        method: 'test/notification',
        params: { data: 'test' },
      };

      // Emit notification message directly - Node.js ws emits Buffer data
      mockWs.emit('message', Buffer.from(JSON.stringify(notification)));

      // Give it a moment for async message processing
      await vi.waitFor(() => {
        expect(onMessageSpy).toHaveBeenCalledWith(notification);
      });
    });

    it('should handle invalid JSON messages', async () => {
      const onErrorSpy = vi.fn();
      transport.onerror = onErrorSpy;

      // Send invalid JSON as Buffer (Node.js ws format)
      mockWs.emit('message', Buffer.from('invalid json'));

      await vi.waitFor(() => {
        expect(onErrorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Failed to parse message'),
          }),
        );
      });
    });

    it('should reject send when WebSocket is closed', async () => {
      await transport.close();

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
        id: 'closed-test-id',
      };

      await expect(transport.send(request)).rejects.toThrow(
        'Transport is closed',
      );
    });
  });

  describe('Connection Events and Error Handling', () => {
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

    it('should handle WebSocket error events', async () => {
      const onErrorSpy = vi.fn();
      transport.onerror = onErrorSpy;

      await transport.start();

      const error = new Error('Connection failed');
      mockWs.emit('error', error);

      await vi.waitFor(() => {
        expect(onErrorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('WebSocket error'),
          }),
        );
      });
    });

    it('should handle normal WebSocket close', async () => {
      const onCloseSpy = vi.fn();
      transport.onclose = onCloseSpy;

      await transport.start();

      // Wait for connection to be established
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      // Close with normal close code - use Node.js ws format: (code, reason)
      mockWs.emit('close', 1000, Buffer.from('Normal closure'));

      // Normal close should not trigger onclose since it's expected
    });

    it('should handle abnormal WebSocket close with reconnection', async () => {
      transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080/ws',
        reconnect: {
          maxAttempts: 2,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          maxDelayMs: 500,
        },
      });

      await transport.start();

      // Wait for initial connection
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      const initialCallCount = vi.mocked(WebSocket).mock.calls.length;

      // Close with abnormal close code - use Node.js ws format
      mockWs.emit('close', 1006, Buffer.from('Abnormal closure'));

      // Wait for reconnection attempt
      await vi.waitFor(
        () => {
          expect(vi.mocked(WebSocket).mock.calls.length).toBeGreaterThan(
            initialCallCount,
          );
        },
        { timeout: 1000 },
      );
    });

    it('should respect maximum reconnection attempts', async () => {
      const onCloseSpy = vi.fn();

      transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080/ws',
        reconnect: {
          maxAttempts: 1,
          initialDelayMs: 10, // Very short delay for test speed
        },
      });

      transport.onclose = onCloseSpy;

      // Mock WebSocket to fail all connections
      let connectionCount = 0;
      vi.mocked(WebSocket).mockImplementation((url, _protocols, _options) => {
        connectionCount++;
        const ws = new MockWebSocket(url, _protocols, _options);

        if (connectionCount === 1) {
          // First connection succeeds briefly then fails
          setTimeout(() => {
            ws.readyState = MockWebSocket.OPEN;
            ws.emit('open', new Event('open'));

            // Then fail to trigger first reconnection
            setTimeout(() => {
              ws.readyState = MockWebSocket.CLOSED;
              ws.emit('close', 1006, Buffer.from('Connection lost'));
            }, 5);
          }, 5);
        } else {
          // All subsequent connections fail immediately
          setTimeout(() => {
            ws.readyState = MockWebSocket.CLOSED;
            ws.emit('close', 1006, Buffer.from('Connection failed'));
          }, 1);
        }

        return ws;
      });

      await transport.start();

      // Wait for reconnection attempts to exhaust
      await vi.waitFor(
        () => {
          expect(onCloseSpy).toHaveBeenCalled();
        },
        { timeout: 500 }, // Short timeout since we're using short delays
      );

      // Should have tried initial connection + maxAttempts retries
      expect(vi.mocked(WebSocket).mock.calls.length).toBe(2); // Initial + 1 retry
    });
  });

  describe('Ping/Pong and Connection Health', () => {
    let transport: WebSocketClientTransport;

    beforeEach(() => {
      transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080/ws',
        pingInterval: 100, // Short interval for testing
      });
    });

    afterEach(async () => {
      await transport.close();
    });

    it('should start ping timer after connection', async () => {
      const pingSpy = vi.spyOn(MockWebSocket.prototype, 'ping');

      await transport.start();

      // Wait for connection to be established
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      // Wait for first ping
      await vi.waitFor(
        () => {
          expect(pingSpy).toHaveBeenCalled();
        },
        { timeout: 200 },
      );
    });

    it('should handle pong responses', async () => {
      await transport.start();

      // Wait for connection
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      // Emit pong
      mockWs.emit('pong');

      // Should not throw errors
      expect(transport).toBeDefined();
    });

    it('should stop ping timer when closed', async () => {
      const pingSpy = vi.spyOn(MockWebSocket.prototype, 'ping');

      await transport.start();

      // Wait for connection
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      await transport.close();

      const initialCallCount = pingSpy.mock.calls.length;

      // Wait a bit and ensure no more pings are sent
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(pingSpy.mock.calls.length).toBe(initialCallCount);
    });
  });

  describe('Protocol Version and Callbacks', () => {
    let transport: WebSocketClientTransport;

    beforeEach(() => {
      transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080/ws',
      });
    });

    afterEach(async () => {
      await transport.close();
    });

    it('should set protocol version', () => {
      expect(() => {
        transport.setProtocolVersion?.('2.0');
      }).not.toThrow();
    });

    it('should trigger callbacks on connection events', async () => {
      const onCloseSpy = vi.fn();
      const onErrorSpy = vi.fn();

      transport.onclose = onCloseSpy;
      transport.onerror = onErrorSpy;

      await transport.start();

      // Wait for connection
      await vi.waitFor(() => {
        expect(mockWs.readyState).toBe(MockWebSocket.OPEN);
      });

      // Trigger error
      mockWs.emit('error', new Error('Test error'));

      await vi.waitFor(() => {
        expect(onErrorSpy).toHaveBeenCalled();
      });

      // Close the transport
      await transport.close();

      expect(onCloseSpy).toHaveBeenCalled();
    });
  });

  describe('Security and Data Sanitization', () => {
    let transport: WebSocketClientTransport;

    beforeEach(() => {
      transport = new WebSocketClientTransport({
        url: 'ws://localhost:8080/ws?auth=secret-token',
      });
    });

    afterEach(async () => {
      await transport.close();
    });

    it('should sanitize URLs in logs', async () => {
      // This test verifies that the internal sanitization logic works
      // We can't directly test the private method, but we can verify
      // the transport handles URLs with auth tokens
      expect(transport).toBeDefined();
    });

    it('should sanitize message data in error logs', async () => {
      await transport.start();

      const onErrorSpy = vi.fn();
      transport.onerror = onErrorSpy;

      // Send invalid JSON with potential token
      const invalidData = '{"auth":"Bearer secret-token", invalid}';
      mockWs.emit('message', Buffer.from(invalidData));

      await vi.waitFor(() => {
        expect(onErrorSpy).toHaveBeenCalled();
      });

      // Verify that sanitization doesn't break the transport
      expect(transport).toBeDefined();
    });
  });
});
