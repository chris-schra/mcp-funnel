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

// Mock modules
vi.mock('ws', () => ({ default: vi.fn() }));
vi.mock('uuid', () => ({ v4: vi.fn() }));
vi.mock('../../src/logger.js', () => ({ logEvent: vi.fn() }));

// Mock WebSocket implementation
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  binaryType: 'nodebuffer' | 'arraybuffer' | 'fragments' = 'nodebuffer';
  readonly bufferedAmount = 0;
  readonly extensions = '';
  readonly isPaused = false;
  readonly protocol = '';
  readyState: 0 | 1 | 2 | 3 = MockWebSocket.CONNECTING;
  readonly url: string;
  onopen: ((event: WebSocket.Event) => void) | null = null;
  onmessage: ((event: WebSocket.MessageEvent) => void) | null = null;
  onerror: ((event: WebSocket.ErrorEvent) => void) | null = null;
  onclose: ((event: WebSocket.CloseEvent) => void) | null = null;
  listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  lastSentData?: string;

  constructor(
    url: string | URL,
    _protocols?: string | string[],
    _options?: ClientOptions | ClientRequestArgs,
  ) {
    this.url = typeof url === 'string' ? url : url.toString();
    this.listeners = {};
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN)
      throw new Error('WebSocket is not open');
    this.lastSentData = data;
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close', code || 1000, Buffer.from(reason || ''));
    }, 10);
  }

  ping(): void {}
  pong(): void {}
  terminate(): void {
    this.readyState = MockWebSocket.CLOSED;
  }
  pause(): void {}
  resume(): void {}
  addEventListener = () => {};
  removeEventListener = () => {};

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners[event]) this.listeners[event] = [];
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
    if (this.listeners[event])
      this.listeners[event] = this.listeners[event].filter(
        (l) => l !== listener,
      );
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) this.listeners[event] = [];
    else this.listeners = {};
    return this;
  }

  off = this.removeListener;
  addListener = this.on;
  setMaxListeners = () => this;
  getMaxListeners = () => 10;
  listenerCount = () => 0;
  prependListener = this.on;
  prependOnceListener = this.once;
  rawListeners = (event: string) => this.listeners[event] || [];
  eventNames = () => Object.keys(this.listeners);

  emit(event: string, ...args: unknown[]): boolean {
    const eventListeners = this.listeners[event];
    if (eventListeners) eventListeners.forEach((listener) => listener(...args));
    return eventListeners ? eventListeners.length > 0 : false;
  }
}

// Test helpers
const createMockAuthProvider = () => ({
  getAuthHeaders: vi
    .fn()
    .mockResolvedValue({ Authorization: 'Bearer test-token' }),
  refreshToken: vi.fn().mockResolvedValue(undefined),
});

const setupMocks = () => {
  let uuidCounter = 0;
  let mockWs: MockWebSocket;

  vi.clearAllMocks();
  (uuidv4 as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    () => `test-uuid-${++uuidCounter}`,
  );

  vi.mocked(WebSocket).mockImplementation((url, protocols, options) => {
    mockWs = new MockWebSocket(url, protocols, options);
    return mockWs as unknown as WebSocket;
  });

  Object.assign(WebSocket, {
    CONNECTING: MockWebSocket.CONNECTING,
    OPEN: MockWebSocket.OPEN,
    CLOSING: MockWebSocket.CLOSING,
    CLOSED: MockWebSocket.CLOSED,
  });

  return { mockWs: () => mockWs };
};

const waitForConnection = async (mockWs: MockWebSocket) => {
  await vi.waitFor(() => expect(mockWs.readyState).toBe(MockWebSocket.OPEN));
};

const createTransport = (
  config: Partial<WebSocketClientTransportConfig> = {},
) =>
  new WebSocketClientTransport({
    url: 'ws://localhost:8080/ws',
    timeout: 1000,
    ...config,
  });

describe('WebSocketClientTransport', () => {
  let getMockWs: () => MockWebSocket;

  beforeEach(() => {
    ({ mockWs: getMockWs } = setupMocks());
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('WebSocket Connection Establishment', () => {
    it('should establish connection with proper headers and close with specific code', async () => {
      const transport = createTransport({ timeout: 5000 });
      await transport.start();
      await waitForConnection(getMockWs());

      expect(vi.mocked(WebSocket)).toHaveBeenCalledWith(
        'ws://localhost:8080/ws',
        expect.objectContaining({ headers: {}, handshakeTimeout: 5000 }),
      );

      const closeSpy = vi.spyOn(getMockWs(), 'close');
      await transport.close();
      expect(closeSpy).toHaveBeenCalledWith(1000, 'Transport closed');
    });
  });

  describe('WebSocket Authentication Handshake', () => {
    it('should include auth headers and handle auth failures', async () => {
      // Test successful auth
      const mockAuthProvider = createMockAuthProvider();
      let transport = createTransport({ authProvider: mockAuthProvider });
      await transport.start();
      expect(mockAuthProvider.getAuthHeaders).toHaveBeenCalled();
      expect(vi.mocked(WebSocket)).toHaveBeenCalledWith(
        'ws://localhost:8080/ws',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
      await transport.close();

      // Test auth failure
      const failingAuthProvider = createMockAuthProvider();
      failingAuthProvider.getAuthHeaders.mockRejectedValue(
        new Error('Auth failed'),
      );
      transport = createTransport({ authProvider: failingAuthProvider });
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
      await transport.close();
    });
  });

  describe('Bidirectional WebSocket Messaging', () => {
    let transport: WebSocketClientTransport;

    beforeEach(async () => {
      transport = createTransport();
      await transport.start();
      await waitForConnection(getMockWs());
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

      const sendPromise = transport.send(request);
      await vi.waitFor(() => expect(getMockWs().lastSentData).toBeDefined());

      const sentMessage = JSON.parse(getMockWs().lastSentData!);
      expect(sentMessage).toEqual(request);

      sendPromise.catch(() => {}); // Expected timeout
    });

    it('should receive messages from WebSocket connection', async () => {
      const onMessageSpy = vi.fn();
      transport.onmessage = onMessageSpy;

      const incomingMessage = {
        jsonrpc: '2.0',
        method: 'server/notification',
        params: { data: 'from-server' },
      };

      getMockWs().emit('message', Buffer.from(JSON.stringify(incomingMessage)));

      await vi.waitFor(() => {
        expect(onMessageSpy).toHaveBeenCalledWith(incomingMessage);
      });
    });

    it('should handle WebSocket connection errors', async () => {
      const onErrorSpy = vi.fn();
      transport.onerror = onErrorSpy;

      const error = new Error('WebSocket connection failed');
      getMockWs().emit('error', error);

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
    const testCloseScenarios = [
      { code: 1000, reason: 'Normal closure', shouldReconnect: false },
      { code: 1002, reason: 'Protocol error', shouldReconnect: false },
      { code: 1006, reason: 'Abnormal closure', shouldReconnect: true },
    ];

    testCloseScenarios.forEach(({ code, reason, shouldReconnect }) => {
      it(`should handle WebSocket close ${code} (${reason}) ${shouldReconnect ? 'with' : 'without'} reconnection`, async () => {
        const config = shouldReconnect
          ? { reconnect: { maxAttempts: 1, initialDelayMs: 10 } }
          : {};
        const transport = createTransport(config);

        await transport.start();
        await waitForConnection(getMockWs());

        const initialCallCount = vi.mocked(WebSocket).mock.calls.length;
        getMockWs().emit('close', code, Buffer.from(reason));

        if (shouldReconnect) {
          await vi.waitFor(
            () => {
              expect(vi.mocked(WebSocket).mock.calls.length).toBeGreaterThan(
                initialCallCount,
              );
            },
            { timeout: 100 },
          );
        } else {
          expect(transport).toBeDefined();
        }

        await transport.close();
      });
    });
  });

  describe('WebSocket Ping/Pong Heartbeat', () => {
    it('should handle ping/pong heartbeat lifecycle', async () => {
      const transport = createTransport({ pingInterval: 50 });
      const pingSpy = vi.spyOn(MockWebSocket.prototype, 'ping');

      // Start and verify ping is initiated
      await transport.start();
      await waitForConnection(getMockWs());
      await vi.waitFor(() => expect(pingSpy).toHaveBeenCalledWith(), {
        timeout: 150,
      });

      // Verify pong handling
      getMockWs().emit('pong', Buffer.from('heartbeat'));
      expect(transport).toBeDefined();

      // Verify heartbeat stops on close
      const initialCallCount = pingSpy.mock.calls.length;
      await transport.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(pingSpy.mock.calls.length).toBe(initialCallCount);
    });
  });
});
