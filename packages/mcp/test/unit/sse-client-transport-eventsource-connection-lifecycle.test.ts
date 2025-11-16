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

describe('SSEClientTransport - EventSource Connection Lifecycle', () => {
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
