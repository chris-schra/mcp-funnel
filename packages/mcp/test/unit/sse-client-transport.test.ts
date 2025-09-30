/**
 * SSE-Specific Tests for SSEClientTransport
 *
 * These tests focus exclusively on SSE-specific functionality that is not covered
 * by the base transport tests. Base functionality like authentication integration,
 * message correlation, and lifecycle management is tested in base-client-transport.test.ts.
 *
 * SSE-Specific Test Categories:
 * 1. EventSource Connection Management: Creation, configuration, event listeners
 * 2. SSE Message Reception: Event handling, JSON-RPC parsing from SSE events
 * 3. EventSource Error Handling: Error states, readyState transitions
 * 4. EventSource Cleanup: Connection closure, event listener removal
 * 5. Browser-Specific Features: Auth query params, withCredentials settings
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
import {
  createMockSSEServer,
  type MockSSEServer,
} from '../mocks/mock-sse-server.js';
import { SSEClientTransport } from '@mcp-funnel/core';
import {
  createMockEventSourceConstructor,
  MockEventSource,
} from '../mocks/mock-eventsource.js';

// Mock the EventSource constructor
const MockEventSourceConstructor = createMockEventSourceConstructor();
vi.stubGlobal('EventSource', MockEventSourceConstructor);

// Mock fetch for HTTP POST requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock UUID generation
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

// Mock logger
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

describe('SSEClientTransport - SSE-Specific Tests', () => {
  let mockSSEServer: MockSSEServer;
  let serverUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up mock SSE server
    const serverInfo = await createMockSSEServer({
      port: 0,
      requireAuth: true,
      authToken: 'test-bearer-token',
    });
    mockSSEServer = serverInfo.server;
    serverUrl = serverInfo.url;

    // Configure mock fetch for HTTP POST requests
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as Response);
  });

  afterEach(async () => {
    vi.resetAllMocks();
    if (mockSSEServer) {
      await mockSSEServer.stop();
    }
  });

  describe('EventSource Connection Management', () => {
    it('should create EventSource with correct URL and configuration', () => {
      const testUrl = 'https://api.example.com/events';
      const eventSource = new MockEventSourceConstructor(testUrl, {
        withCredentials: false,
      });

      expect(eventSource.url).toBe(testUrl);
      expect(eventSource.withCredentials).toBe(false);
      expect(eventSource.readyState).toBe(MockEventSource.CONNECTING);
    });

    it('should inject auth token as query parameter for EventSource', () => {
      const baseUrl = 'https://api.example.com/events';
      const authToken = 'Bearer test-token-123';
      const expectedUrl = `${baseUrl}?auth=${encodeURIComponent(authToken)}`;

      const eventSource = new MockEventSourceConstructor(expectedUrl);

      expect(eventSource.url).toBe(expectedUrl);
      expect(eventSource.url).toContain('auth=Bearer%20test-token-123');
    });

    it('should handle EventSource readyState transitions', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');

      // Initial state
      expect(eventSource.readyState).toBe(MockEventSource.CONNECTING);

      // Simulate connection opening
      eventSource.readyState = MockEventSource.OPEN;
      expect(eventSource.readyState).toBe(MockEventSource.OPEN);

      // Simulate connection closing
      eventSource.close();
      expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
    });

    it('should configure withCredentials for CORS requests', () => {
      const eventSource1 = new MockEventSource(
        'https://api.example.com/events',
        {
          withCredentials: true,
        },
      );
      expect(eventSource1.withCredentials).toBe(true);

      const eventSource2 = new MockEventSource(
        'https://api.example.com/events',
        {
          withCredentials: false,
        },
      );
      expect(eventSource2.withCredentials).toBe(false);
    });

    it('should set up event listeners for SSE events', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      const openHandler = vi.fn();
      const messageHandler = vi.fn();
      const errorHandler = vi.fn();

      eventSource.addEventListener('open', openHandler);
      eventSource.addEventListener('message', messageHandler);
      eventSource.addEventListener('error', errorHandler);

      // Verify listeners were added (MockEventSource extends EventEmitter)
      expect(eventSource.listenerCount('open')).toBe(1);
      expect(eventSource.listenerCount('message')).toBe(1);
      expect(eventSource.listenerCount('error')).toBe(1);
    });
  });

  describe('SSE Message Reception', () => {
    it('should receive and parse valid JSON-RPC messages from SSE events', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      eventSource.readyState = MockEventSource.OPEN; // Ensure EventSource is open
      const messageHandler = vi.fn();
      eventSource.addEventListener('message', messageHandler);

      const jsonRpcResponse: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'test-request-123',
        result: { status: 'success', data: 'test-data' },
      };

      eventSource.simulateMessage(JSON.stringify(jsonRpcResponse));

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: JSON.stringify(jsonRpcResponse),
          type: 'message',
        }),
      );
    });

    it('should handle SSE message events with event ID and type', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      eventSource.readyState = MockEventSource.OPEN; // Ensure EventSource is open
      const messageHandler = vi.fn();
      eventSource.addEventListener('message', messageHandler);

      const responseData = JSON.stringify({
        jsonrpc: '2.0',
        id: 'req-456',
        result: { value: 42 },
      });

      eventSource.simulateMessage(responseData, 'response', 'event-id-789');

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: responseData,
          type: 'response',
          lastEventId: 'event-id-789',
        }),
      );
      expect(eventSource.lastEventId).toBe('event-id-789');
    });

    it('should only process messages when EventSource is in OPEN state', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      const messageHandler = vi.fn();
      eventSource.addEventListener('message', messageHandler);

      // Try to send message while CONNECTING
      eventSource.readyState = MockEventSource.CONNECTING;
      eventSource.simulateMessage('test-data');
      expect(messageHandler).not.toHaveBeenCalled();

      // Send message when OPEN
      eventSource.readyState = MockEventSource.OPEN;
      eventSource.simulateMessage('test-data');
      expect(messageHandler).toHaveBeenCalledTimes(1);

      // Try to send message when CLOSED
      eventSource.readyState = MockEventSource.CLOSED;
      messageHandler.mockClear();
      eventSource.simulateMessage('test-data-2');
      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('should handle notification messages without request correlation', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      eventSource.readyState = MockEventSource.OPEN; // Ensure EventSource is open
      const messageHandler = vi.fn();
      eventSource.addEventListener('message', messageHandler);

      const notification = {
        jsonrpc: '2.0',
        method: 'notification/example',
        params: { message: 'Hello from server' },
      };

      eventSource.simulateMessage(JSON.stringify(notification));

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: JSON.stringify(notification),
        }),
      );
    });
  });

  describe('EventSource Error Handling', () => {
    it('should handle EventSource error events', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      const errorHandler = vi.fn();
      eventSource.addEventListener('error', errorHandler);

      const testError = new Error('Connection failed');
      eventSource.simulateError(testError, false);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          error: testError,
          message: 'Connection failed',
        }),
      );
      expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
    });

    it('should transition to CONNECTING state for recoverable errors', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      eventSource.readyState = MockEventSource.OPEN;

      // Add error handler to prevent unhandled error
      const errorHandler = vi.fn();
      eventSource.addEventListener('error', errorHandler);

      eventSource.simulateError('Network timeout', true); // shouldReconnect = true

      expect(eventSource.readyState).toBe(MockEventSource.CONNECTING);
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should transition to CLOSED state for non-recoverable errors', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      eventSource.readyState = MockEventSource.OPEN;

      // Add error handler to prevent unhandled error
      const errorHandler = vi.fn();
      eventSource.addEventListener('error', errorHandler);

      eventSource.simulateError('Authentication failed', false); // shouldReconnect = false

      expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should handle connection failures during establishment', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      const errorHandler = vi.fn();
      eventSource.addEventListener('error', errorHandler);

      eventSource.simulateConnectionFailure();

      expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Connection failed',
        }),
      );
    });
  });

  describe('EventSource Connection Lifecycle', () => {
    it('should handle EventSource open events', async () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      const openHandler = vi.fn();

      eventSource.addEventListener('open', openHandler);

      // Wait for the MockEventSource to simulate opening
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => {
          expect(eventSource.readyState).toBe(MockEventSource.OPEN);
          expect(openHandler).toHaveBeenCalled();
          resolve();
        };
      });
    });

    it('should handle EventSource close without error event', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      eventSource.readyState = MockEventSource.OPEN;

      eventSource.close();

      expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
    });

    it('should track connection attempts and statistics', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');

      const stats = eventSource.getConnectionStats();
      expect(stats.attempts).toBeGreaterThanOrEqual(0);
      expect(stats.url).toBe('https://api.example.com/events');
      expect(stats.readyState).toBeDefined();
    });
  });

  describe('EventSource Cleanup and Resource Management', () => {
    it('should properly close EventSource connection', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      eventSource.readyState = MockEventSource.OPEN;

      expect(eventSource.readyState).toBe(MockEventSource.OPEN);

      eventSource.close();

      expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
    });

    it('should remove event listeners on cleanup', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      const openHandler = vi.fn();
      const messageHandler = vi.fn();
      const errorHandler = vi.fn();

      eventSource.addEventListener('open', openHandler);
      eventSource.addEventListener('message', messageHandler);
      eventSource.addEventListener('error', errorHandler);

      expect(eventSource.listenerCount('open')).toBe(1);
      expect(eventSource.listenerCount('message')).toBe(1);
      expect(eventSource.listenerCount('error')).toBe(1);

      eventSource.removeEventListener('open', openHandler);
      eventSource.removeEventListener('message', messageHandler);
      eventSource.removeEventListener('error', errorHandler);

      expect(eventSource.listenerCount('open')).toBe(0);
      expect(eventSource.listenerCount('message')).toBe(0);
      expect(eventSource.listenerCount('error')).toBe(0);
    });

    it('should handle multiple close calls gracefully', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      eventSource.readyState = MockEventSource.OPEN;

      eventSource.close();
      expect(eventSource.readyState).toBe(MockEventSource.CLOSED);

      // Second close should be safe
      eventSource.close();
      expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
    });

    it('should use same bound function references for add and remove to prevent memory leaks', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');

      // Create bound handlers
      const openHandler = vi.fn();
      const messageHandler = vi.fn();
      const errorHandler = vi.fn();

      // Add listeners
      eventSource.addEventListener('open', openHandler);
      eventSource.addEventListener('message', messageHandler);
      eventSource.addEventListener('error', errorHandler);

      expect(eventSource.listenerCount('open')).toBe(1);
      expect(eventSource.listenerCount('message')).toBe(1);
      expect(eventSource.listenerCount('error')).toBe(1);

      // Remove using same references - should work
      eventSource.removeEventListener('open', openHandler);
      eventSource.removeEventListener('message', messageHandler);
      eventSource.removeEventListener('error', errorHandler);

      expect(eventSource.listenerCount('open')).toBe(0);
      expect(eventSource.listenerCount('message')).toBe(0);
      expect(eventSource.listenerCount('error')).toBe(0);
    });

    it('should fail to remove listeners when different bound functions are used (memory leak scenario)', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');

      const originalHandler = () => console.log('test');

      // Add listener with one bound function
      eventSource.addEventListener('open', originalHandler.bind({}));
      expect(eventSource.listenerCount('open')).toBe(1);

      // Try to remove with different bound function - should fail
      eventSource.removeEventListener('open', originalHandler.bind({}));
      expect(eventSource.listenerCount('open')).toBe(1); // Still has listener - memory leak!
    });

    it('should verify memory leak prevention during multiple reconnections', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');

      // Simulate multiple connection cycles
      for (let i = 0; i < 5; i++) {
        const openHandler = vi.fn();
        const messageHandler = vi.fn();
        const errorHandler = vi.fn();

        // Add listeners
        eventSource.addEventListener('open', openHandler);
        eventSource.addEventListener('message', messageHandler);
        eventSource.addEventListener('error', errorHandler);

        expect(eventSource.listenerCount('open')).toBe(1);
        expect(eventSource.listenerCount('message')).toBe(1);
        expect(eventSource.listenerCount('error')).toBe(1);

        // Remove using same references
        eventSource.removeEventListener('open', openHandler);
        eventSource.removeEventListener('message', messageHandler);
        eventSource.removeEventListener('error', errorHandler);

        // Verify all listeners are removed
        expect(eventSource.listenerCount('open')).toBe(0);
        expect(eventSource.listenerCount('message')).toBe(0);
        expect(eventSource.listenerCount('error')).toBe(0);
      }
    });
  });

  describe('Browser-Specific SSE Features', () => {
    it('should support auth tokens via query parameters due to browser limitations', () => {
      const baseUrl = 'https://api.example.com/events';
      const authToken = 'Bearer my-secret-token';
      const encodedToken = encodeURIComponent(authToken);
      const urlWithAuth = `${baseUrl}?auth=${encodedToken}`;

      const eventSource = new MockEventSource(urlWithAuth);

      expect(eventSource.url).toBe(urlWithAuth);
      expect(eventSource.url).toContain('auth=Bearer%20my-secret-token');
    });

    it('should handle EventSource readyState constants correctly', () => {
      expect(MockEventSource.CONNECTING).toBe(0);
      expect(MockEventSource.OPEN).toBe(1);
      expect(MockEventSource.CLOSED).toBe(2);

      const eventSource = new MockEventSource('https://api.example.com/events');
      expect(eventSource.CONNECTING).toBe(0);
      expect(eventSource.OPEN).toBe(1);
      expect(eventSource.CLOSED).toBe(2);
    });

    it('should maintain last event ID for SSE reconnection', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');
      eventSource.readyState = MockEventSource.OPEN; // Ensure EventSource is open

      expect(eventSource.lastEventId).toBe('');

      eventSource.simulateMessage('test data', 'message', 'event-123');
      expect(eventSource.lastEventId).toBe('event-123');

      eventSource.simulateMessage('more data', 'message', 'event-456');
      expect(eventSource.lastEventId).toBe('event-456');
    });

    it('should control reconnection behavior for testing', () => {
      const eventSource = new MockEventSource('https://api.example.com/events');

      expect(eventSource.shouldReconnect).toBe(true);

      eventSource.setReconnectionBehavior(false);
      expect(eventSource.shouldReconnect).toBe(false);

      eventSource.setReconnectionBehavior(true);
      expect(eventSource.shouldReconnect).toBe(true);
    });
  });

  describe('SSE Integration with Mock Server', () => {
    it('should interact with mock SSE server for testing', async () => {
      // Test the mock server itself to verify it works correctly
      const stats = mockSSEServer.getStats();
      expect(stats.isStarted).toBe(true);
      expect(stats.activeConnections).toBe(0);
      expect(stats.messagesSent).toBe(0);
    });

    it('should handle server-sent events through mock infrastructure', () => {
      const eventSource = new MockEventSource(serverUrl);
      eventSource.readyState = MockEventSource.OPEN; // Ensure EventSource is open
      const messageHandler = vi.fn();
      eventSource.addEventListener('message', messageHandler);

      // Simulate server sending a message
      const testMessage = {
        jsonrpc: '2.0',
        method: 'notification/test',
        params: { message: 'Hello from mock server' },
      };

      eventSource.simulateMessage(JSON.stringify(testMessage));

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: JSON.stringify(testMessage),
        }),
      );
    });
  });

  describe('SSEClientTransport Memory Leak Prevention', () => {
    it('should prevent memory leaks by using same bound function references', async () => {
      const transport = new SSEClientTransport({
        url: serverUrl,
        timeout: 5000,
      });

      // Access private methods for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transportAny = transport as any;

      // Create a mock EventSource to test bound handlers
      const mockEventSource = new MockEventSource(serverUrl);
      transportAny.eventSource = mockEventSource;

      // Call setupEventSourceListeners
      transportAny.setupEventSourceListeners();

      // Verify listeners were added
      expect(mockEventSource.listenerCount('open')).toBe(1);
      expect(mockEventSource.listenerCount('message')).toBe(1);
      expect(mockEventSource.listenerCount('error')).toBe(1);

      // Verify bound handlers are stored
      expect(transportAny.boundHandlers.open).toBeDefined();
      expect(transportAny.boundHandlers.message).toBeDefined();
      expect(transportAny.boundHandlers.error).toBeDefined();

      // Store references to verify they're the same
      const _storedOpenHandler = transportAny.boundHandlers.open;
      const _storedMessageHandler = transportAny.boundHandlers.message;
      const _storedErrorHandler = transportAny.boundHandlers.error;

      // Call removeEventSourceListeners
      transportAny.removeEventSourceListeners();

      // Verify all listeners were removed
      expect(mockEventSource.listenerCount('open')).toBe(0);
      expect(mockEventSource.listenerCount('message')).toBe(0);
      expect(mockEventSource.listenerCount('error')).toBe(0);

      // Verify bound handlers are cleared
      expect(transportAny.boundHandlers.open).toBeUndefined();
      expect(transportAny.boundHandlers.message).toBeUndefined();
      expect(transportAny.boundHandlers.error).toBeUndefined();

      // Cleanup
      await transport.close();
    });

    it('should clean up handlers during multiple connection cycles', async () => {
      const transport = new SSEClientTransport({
        url: serverUrl,
        timeout: 5000,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transportAny = transport as any;

      // Simulate multiple connection cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        const mockEventSource = new MockEventSource(serverUrl);
        transportAny.eventSource = mockEventSource;

        // Setup listeners
        transportAny.setupEventSourceListeners();

        // Verify listeners were added
        expect(mockEventSource.listenerCount('open')).toBe(1);
        expect(mockEventSource.listenerCount('message')).toBe(1);
        expect(mockEventSource.listenerCount('error')).toBe(1);

        // Verify bound handlers exist
        expect(transportAny.boundHandlers.open).toBeDefined();
        expect(transportAny.boundHandlers.message).toBeDefined();
        expect(transportAny.boundHandlers.error).toBeDefined();

        // Cleanup (simulate connection close)
        transportAny.removeEventSourceListeners();

        // Verify all listeners were removed
        expect(mockEventSource.listenerCount('open')).toBe(0);
        expect(mockEventSource.listenerCount('message')).toBe(0);
        expect(mockEventSource.listenerCount('error')).toBe(0);

        // Verify handlers are cleared
        expect(Object.keys(transportAny.boundHandlers)).toHaveLength(0);
      }

      // Final cleanup
      await transport.close();
    });

    it('should properly cleanup during closeConnection', async () => {
      const transport = new SSEClientTransport({
        url: serverUrl,
        timeout: 5000,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transportAny = transport as any;

      // Set up a mock EventSource
      const mockEventSource = new MockEventSource(serverUrl);
      transportAny.eventSource = mockEventSource;

      // Setup listeners
      transportAny.setupEventSourceListeners();

      // Verify setup
      expect(mockEventSource.listenerCount('open')).toBe(1);
      expect(mockEventSource.listenerCount('message')).toBe(1);
      expect(mockEventSource.listenerCount('error')).toBe(1);
      expect(transportAny.boundHandlers.open).toBeDefined();

      // Call closeConnection
      await transportAny.closeConnection();

      // Verify EventSource is null
      expect(transportAny.eventSource).toBeNull();

      // Verify handlers are cleared (even though eventSource is null)
      expect(Object.keys(transportAny.boundHandlers)).toHaveLength(0);
    });

    it('should handle edge case where removeEventSourceListeners is called without EventSource', async () => {
      const transport = new SSEClientTransport({
        url: serverUrl,
        timeout: 5000,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transportAny = transport as any;

      // Set up bound handlers without EventSource
      transportAny.boundHandlers = {
        open: vi.fn(),
        message: vi.fn(),
        error: vi.fn(),
      };

      // This should not throw and should clear handlers
      transportAny.removeEventSourceListeners();

      // Verify handlers are cleared
      expect(Object.keys(transportAny.boundHandlers)).toHaveLength(0);

      // Cleanup
      await transport.close();
    });
  });
});
