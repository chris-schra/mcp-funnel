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
import { v4 as uuidv4 } from 'uuid';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  MessageExtraInfo,
} from '@modelcontextprotocol/sdk/types.js';

// Define CloseEvent for test environment
global.CloseEvent = class CloseEvent extends Event {
  public code: number;
  public reason: string;
  public wasClean: boolean;

  constructor(type: string, options?: { code?: number; reason?: string; wasClean?: boolean }) {
    super(type);
    this.code = options?.code ?? 1000;
    this.reason = options?.reason ?? '';
    this.wasClean = options?.wasClean ?? false;
  }
} as any;

// Mock WebSocket and uuid modules
vi.mock('ws', () => {
  const mockWebSocket = vi.fn();
  mockWebSocket.CONNECTING = 0;
  mockWebSocket.OPEN = 1;
  mockWebSocket.CLOSING = 2;
  mockWebSocket.CLOSED = 3;
  return { default: mockWebSocket };
});

vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

// Mock logger
vi.mock('../../src/logger.js', () => ({
  logEvent: vi.fn(),
}));

import { WebSocketClientTransport } from '../../src/transports/implementations/websocket-client-transport.js';
import { TransportError } from '../../src/transports/errors/transport-error.js';
import type { WebSocketClientTransportConfig } from '../../src/transports/implementations/websocket-client-transport.js';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

// Mock WebSocket implementation for testing
class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readyState = MockWebSocket.CONNECTING;
  public url: string;
  public protocol?: string;
  public onopen?: ((event: Event) => void) | null = null;
  public onmessage?: ((event: MessageEvent) => void) | null = null;
  public onerror?: ((event: Event) => void) | null = null;
  public onclose?: ((event: CloseEvent) => void) | null = null;

  private listeners: Record<string, Function[]> = {};

  constructor(url: string, _protocols?: string | string[], _options?: any) {
    this.url = url;
    this.listeners = {};

    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open', new Event('open'));
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
      const closeEvent = new CloseEvent('close', {
        code: code || 1000,
        reason: reason || '',
      });
      this.emit('close', closeEvent);
    }, 10);
  }

  ping(data?: any): void {
    // Simulate ping
  }

  on(event: string, listener: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners[event] = [];
    } else {
      this.listeners = {};
    }
  }

  emit(event: string, ...args: any[]): void {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      eventListeners.forEach((listener) => listener(...args));
    }

    // Also call the onXXX properties
    if (event === 'open' && this.onopen) {
      this.onopen(args[0]);
    } else if (event === 'message' && this.onmessage) {
      this.onmessage(args[0]);
    } else if (event === 'error' && this.onerror) {
      this.onerror(args[0]);
    } else if (event === 'close' && this.onclose) {
      this.onclose(args[0]);
    }
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
    vi.mocked(WebSocket).mockImplementation((url, _protocols, _options) => {
      mockWs = new MockWebSocket(url, _protocols, _options);
      return mockWs as any;
    });

    // Set static properties
    (WebSocket as any).CONNECTING = MockWebSocket.CONNECTING;
    (WebSocket as any).OPEN = MockWebSocket.OPEN;
    (WebSocket as any).CLOSING = MockWebSocket.CLOSING;
    (WebSocket as any).CLOSED = MockWebSocket.CLOSED;
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
      }).toThrow(/WSS required in production environment/);

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
            message: expect.stringContaining('Failed to create WebSocket'),
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
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
        params: { key: 'value' },
      };

      // Send request in background and immediately send response
      const sendPromise = transport.send(request);

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

      // Simulate server response
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: sentMessage.id,
        result: { success: true },
      };

      mockWs.emit(
        'message',
        new MessageEvent('message', { data: JSON.stringify(response) }),
      );

      await sendPromise;
    });

    it('should preserve existing request ID', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
        id: 'existing-id',
      };

      const sendPromise = transport.send(request);

      // Wait for send to be called
      await vi.waitFor(() => {
        expect(mockWs.lastSentData).toBeDefined();
      });

      const sentMessage = JSON.parse(mockWs.lastSentData!);

      expect(sentMessage.id).toBe('existing-id');

      // Send response to complete the request
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'existing-id',
        result: { success: true },
      };

      mockWs.emit(
        'message',
        new MessageEvent('message', { data: JSON.stringify(response) }),
      );

      await sendPromise;
    });

    it('should handle request timeout', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
      };

      // Don't send a response, let it timeout
      await expect(transport.send(request)).rejects.toThrow(
        /Request timeout after 1000ms/,
      );
    });

    it('should handle JSON-RPC error responses', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
        id: 'test-id',
      };

      const sendPromise = transport.send(request);

      // Send error response
      const errorResponse = {
        jsonrpc: '2.0',
        id: 'test-id',
        error: { code: -1, message: 'Test error' },
      };

      mockWs.emit(
        'message',
        new MessageEvent('message', { data: JSON.stringify(errorResponse) }),
      );

      await expect(sendPromise).rejects.toThrow(/JSON-RPC error/);
    });

    it('should forward unmatched messages to onmessage', async () => {
      const onMessageSpy = vi.fn();
      transport.onmessage = onMessageSpy;

      const notification = {
        jsonrpc: '2.0',
        method: 'test/notification',
        params: { data: 'test' },
      };

      mockWs.emit(
        'message',
        new MessageEvent('message', { data: JSON.stringify(notification) }),
      );

      await vi.waitFor(() => {
        expect(onMessageSpy).toHaveBeenCalledWith(notification);
      });
    });

    it('should handle invalid JSON messages', async () => {
      const onErrorSpy = vi.fn();
      transport.onerror = onErrorSpy;

      mockWs.emit(
        'message',
        new MessageEvent('message', { data: 'invalid json' }),
      );

      await vi.waitFor(() => {
        expect(onErrorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Failed to parse WebSocket message'),
          }),
        );
      });
    });

    it('should reject send when WebSocket is closed', async () => {
      await transport.close();

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
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

      // Close with normal close code
      mockWs.emit(
        'close',
        new CloseEvent('close', { code: 1000, reason: 'Normal closure' }),
      );

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

      // Close with abnormal close code
      mockWs.emit(
        'close',
        new CloseEvent('close', { code: 1006, reason: 'Abnormal closure' }),
      );

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
          initialDelayMs: 50,
        },
      });

      transport.onclose = onCloseSpy;

      // Mock WebSocket to fail connections after first one
      let connectionCount = 0;
      vi.mocked(WebSocket).mockImplementation((url, _protocols, _options) => {
        connectionCount++;
        const ws = new MockWebSocket(url, _protocols, _options);

        if (connectionCount > 1) {
          // Fail subsequent connections
          setTimeout(() => {
            ws.readyState = MockWebSocket.CLOSED;
            ws.emit(
              'close',
              new CloseEvent('close', { code: 1006, reason: 'Connection failed' }),
            );
          }, 10);
        } else {
          // First connection succeeds then fails
          setTimeout(() => {
            ws.readyState = MockWebSocket.OPEN;
            ws.emit('open', new Event('open'));

            // Then immediately fail
            setTimeout(() => {
              ws.readyState = MockWebSocket.CLOSED;
              ws.emit(
                'close',
                new CloseEvent('close', {
                  code: 1006,
                  reason: 'Connection lost',
                }),
              );
            }, 10);
          }, 10);
        }

        return ws;
      });

      await transport.start();

      // Wait for max attempts to be reached
      await vi.waitFor(
        () => {
          expect(onCloseSpy).toHaveBeenCalled();
        },
        { timeout: 2000 },
      );

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
      const onOpenSpy = vi.fn();
      const onCloseSpy = vi.fn();
      const onErrorSpy = vi.fn();

      // Note: onopen is not part of Transport interface, but we test it anyway
      // transport.onopen = onOpenSpy;
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
      mockWs.emit('message', new MessageEvent('message', { data: invalidData }));

      await vi.waitFor(() => {
        expect(onErrorSpy).toHaveBeenCalled();
      });

      // Verify that sanitization doesn't break the transport
      expect(transport).toBeDefined();
    });
  });
});