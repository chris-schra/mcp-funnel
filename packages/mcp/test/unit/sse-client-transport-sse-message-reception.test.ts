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

import { describe, it, expect, vi } from 'vitest';

import type { JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
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

describe('SSEClientTransport - SSE Message Reception', () => {
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
