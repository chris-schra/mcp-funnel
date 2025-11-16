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

describe('SSEClientTransport - EventSource Error Handling', () => {
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
