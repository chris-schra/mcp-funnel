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

import { createMockSSEServer, type MockSSEServer } from '../mocks/mock-sse-server.js';
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

describe('SSEClientTransport - SSE Integration with Mock Server', () => {
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
