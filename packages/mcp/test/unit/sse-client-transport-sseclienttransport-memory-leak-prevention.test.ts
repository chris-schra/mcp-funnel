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

import { createMockSSEServer } from '../mocks/mock-sse-server.js';
import { SSEClientTransport } from '@mcp-funnel/core';
import { createMockEventSourceConstructor, MockEventSource } from '../mocks/mock-eventsource.js';

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

describe('SSEClientTransport - SSEClientTransport Memory Leak Prevention', () => {
  let serverUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up mock SSE server
    const serverInfo = await createMockSSEServer({
      port: 0,
      requireAuth: true,
      authToken: 'test-bearer-token',
    });
    serverUrl = serverInfo.url;

    // Stop the server immediately since these tests don't need a running server
    await serverInfo.server.stop();

    // Configure mock fetch for HTTP POST requests
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as Response);
  });

  afterEach(async () => {
    vi.resetAllMocks();
  });
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
